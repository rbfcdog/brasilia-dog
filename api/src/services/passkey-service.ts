import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import type { SessionService } from './session-service.js';

export interface PasskeyCredentialRecord {
  id: string;
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  transports: string[];
  deviceType?: string;
  backedUp: boolean;
}

export interface PasskeyStore {
  saveCredential(userId: string, credential: PasskeyCredentialRecord): Promise<void>;
  getCredential(userId: string, credentialId: string): Promise<PasskeyCredentialRecord | null>;
  listCredentials(userId: string): Promise<PasskeyCredentialRecord[]>;
  updateCounter(userId: string, credentialId: string, counter: number): Promise<void>;
  getCurrentChallenge(userId: string): Promise<string | null>;
  setCurrentChallenge(userId: string, challenge: string): Promise<void>;
}

export interface RegistrationResult {
  verified: boolean;
  credentialId?: string;
}

export interface AuthenticationResult {
  verified: boolean;
  credentialId?: string;
  sessionToken?: string;
  sessionExpiresAt?: number;
}

interface PasskeyServiceOptions {
  rpName: string;
  rpId: string;
  origin: string;
  store: PasskeyStore;
  sessionService?: SessionService;
}

export class PasskeyService {
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origin: string;
  private readonly store: PasskeyStore;
  private readonly sessionService?: SessionService;

  constructor({ rpName, rpId, origin, store, sessionService }: PasskeyServiceOptions) {
    this.rpName = rpName;
    this.rpId = rpId;
    this.origin = origin;
    this.store = store;
    this.sessionService = sessionService;
  }

  async generateRegistration(userId: string, username: string) {
    const credentials = await this.store.listCredentials(userId);

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: username,
      attestationType: 'none',
      excludeCredentials: credentials.map((c) => ({
        id: c.credentialId,
        type: 'public-key' as const,
        transports: c.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.store.setCurrentChallenge(userId, options.challenge);

    return options;
  }

  async verifyRegistration(userId: string, response: unknown): Promise<RegistrationResult> {
    const expectedChallenge = await this.store.getCurrentChallenge(userId);

    if (!expectedChallenge) {
      throw new Error('No pending registration challenge.');
    }

    const verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const record: PasskeyCredentialRecord = {
        id: credential.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        backedUp: false,
      };

      await this.store.saveCredential(userId, record);
      await this.store.setCurrentChallenge(userId, '');
      return { verified: true, credentialId: record.credentialId };
    }

    await this.store.setCurrentChallenge(userId, '');
    return { verified: false };
  }

  async generateAuthentication(userId: string) {
    const credentials = await this.store.listCredentials(userId);

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        type: 'public-key' as const,
        transports: c.transports as AuthenticatorTransport[],
      })),
      userVerification: 'preferred',
    });

    await this.store.setCurrentChallenge(userId, options.challenge);

    return options;
  }

  async verifyAuthentication(userId: string, response: unknown): Promise<AuthenticationResult> {
    const expectedChallenge = await this.store.getCurrentChallenge(userId);

    if (!expectedChallenge) {
      throw new Error('No pending authentication challenge.');
    }

    const body = response as { id: string } & Record<string, unknown>;
    const credential = await this.store.getCredential(userId, body.id);

    if (!credential) {
      throw new Error('Credential not found for this user.');
    }

    const verification = await verifyAuthenticationResponse({
      response: body as never,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransport[],
      },
    });

    if (verification.verified) {
      await this.store.updateCounter(userId, credential.credentialId, verification.authenticationInfo.newCounter);
      await this.store.setCurrentChallenge(userId, '');

      if (this.sessionService) {
        const session = await this.sessionService.createSession(userId, credential.credentialId);
        return {
          verified: true,
          credentialId: credential.credentialId,
          sessionToken: session.token,
          sessionExpiresAt: session.expiresAt,
        };
      }

      return { verified: true, credentialId: credential.credentialId };
    }

    await this.store.setCurrentChallenge(userId, '');
    return { verified: false };
  }
}
