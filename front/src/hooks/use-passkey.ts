"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearPasskeySessionToken,
  getPasskeySessionToken,
  storePasskeySessionToken,
} from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import type {
  PasskeyAuthOptions,
  PasskeyRegistrationOptions,
  PasskeyVerificationResult,
} from "@/services/backend-service";

export type PasskeyStatus = "idle" | "loading" | "success" | "error";

export interface PasskeyState {
  status: PasskeyStatus;
  message: string | null;
  sessionToken: string | null;
  userId: string | null;
}

const initialState: PasskeyState = {
  status: "idle",
  message: null,
  sessionToken: null,
  userId: null,
};

function toBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && "credentials" in navigator;
}

/**
 * Initiates WebAuthn registration (create) using the browser PublicKeyCredential API
 * and verifies the result with the backend.
 */
async function registerPasskey(): Promise<PasskeyVerificationResult> {
  const options: PasskeyRegistrationOptions = await backendService.passkeyRegisterOptions();

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: fromBase64url(options.challenge),
    rp: options.rp,
    user: {
      id: fromBase64url(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    ...(options.excludeCredentials
      ? {
          excludeCredentials: options.excludeCredentials.map(({ id, transports, type }) => ({
            id: fromBase64url(id),
            type: type as PublicKeyCredentialType,
            ...(transports ? { transports: transports as AuthenticatorTransport[] } : {}),
          })),
        }
      : {}),
    ...(options.authenticatorSelection ? { authenticatorSelection: options.authenticatorSelection } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {}),
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error("Registration returned no credential.");

  const pkCredential = credential as PublicKeyCredential;
  const response = pkCredential.response as AuthenticatorAttestationResponse;
  const attestationObject = response.attestationObject
    ? toBase64url(response.attestationObject)
    : null;
  const clientDataJSON = response.clientDataJSON ? toBase64url(response.clientDataJSON) : null;

  return backendService.passkeyRegisterVerify({
    id: pkCredential.id,
    rawId: toBase64url(pkCredential.rawId),
    type: pkCredential.type,
    response: {
      attestationObject,
      clientDataJSON,
    },
    clientExtensionResults: {},
  });
}

/**
 * Initiates WebAuthn authentication (get) using the browser PublicKeyCredential API
 * and verifies the assertion with the backend, which returns a session token.
 */
export async function authenticatePasskey(): Promise<PasskeyVerificationResult> {
  const options: PasskeyAuthOptions = await backendService.passkeyAuthOptions();

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64url(options.challenge),
    ...(options.rpId ? { rpId: options.rpId } : {}),
    ...(options.allowCredentials
      ? {
          allowCredentials: options.allowCredentials.map(({ id, transports, type }) => ({
            id: fromBase64url(id),
            type: type as PublicKeyCredentialType,
            ...(transports ? { transports: transports as AuthenticatorTransport[] } : {}),
          })),
        }
      : {}),
    ...(options.userVerification ? { userVerification: options.userVerification } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {}),
  };

  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error("Authentication returned no assertion.");

  const pkAssertion = assertion as PublicKeyCredential;
  const response = pkAssertion.response as AuthenticatorAssertionResponse;
  const authenticatorData = response.authenticatorData ? toBase64url(response.authenticatorData) : null;
  const clientDataJSON = response.clientDataJSON ? toBase64url(response.clientDataJSON) : null;
  const signature = response.signature ? toBase64url(response.signature) : null;

  return backendService.passkeyAuthVerify({
    id: pkAssertion.id,
    rawId: toBase64url(pkAssertion.rawId),
    type: pkAssertion.type,
    response: {
      authenticatorData,
      clientDataJSON,
      signature,
    },
    clientExtensionResults: {},
  });
}

export function usePasskey() {
  const [state, setState] = useState<PasskeyState>(initialState);

  // On mount, check if a stored session token is still valid.
  useEffect(() => {
    const token = getPasskeySessionToken();
    if (!token) return;

    void backendService
      .verifyPasskeySession(token)
      .then((session) => {
        setState({
          status: "success",
          message: "Session restored.",
          sessionToken: token,
          userId: session.userId,
        });
      })
      .catch(() => {
        clearPasskeySessionToken();
        setState({
          status: "idle",
          message: "Previous session expired.",
          sessionToken: null,
          userId: null,
        });
      });
  }, []);

  const registrationKey = (userId: string) => `brasilia-dog.passkey-registered.${userId}`;

  const register = useCallback(async (userId: string) => {
    if (!isWebAuthnSupported()) {
      setState({ status: "error", message: "WebAuthn is not supported in this browser.", sessionToken: null, userId: null });
      return;
    }
    setState({ status: "loading", message: "Waiting for passkey creation...", sessionToken: null, userId: null });
    try {
      const result = await registerPasskey();
      if (result.verified) {
        window.sessionStorage.setItem(registrationKey(userId), "true");
        setState({
          status: "success",
          message: "Biometric check succeeded. Click Test biometry again to authenticate.",
          sessionToken: null,
          userId,
        });
      } else {
        setState({ status: "error", message: "Registration verification failed.", sessionToken: null, userId: null });
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Registration failed.",
        sessionToken: null,
        userId: null,
      });
    }
  }, []);

  const authenticate = useCallback(async (userId: string) => {
    if (!isWebAuthnSupported()) {
      setState({ status: "error", message: "WebAuthn is not supported in this browser.", sessionToken: null, userId: null });
      return;
    }
    setState({ status: "loading", message: "Waiting for passkey verification...", sessionToken: null, userId: null });
    try {
      const result = await authenticatePasskey();
      if (result.verified && result.sessionToken) {
        storePasskeySessionToken(result.sessionToken);
        setState({
          status: "success",
          message: "Authentication successful.",
          sessionToken: result.sessionToken,
          userId,
        });
      } else {
        setState({ status: "error", message: "Authentication verification failed.", sessionToken: null, userId: null });
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Authentication failed.",
        sessionToken: null,
        userId: null,
      });
    }
  }, []);

  const test = useCallback(
    async (userId: string) => {
      if (window.sessionStorage.getItem(registrationKey(userId)) === "true") {
        await authenticate(userId);
        return;
      }
      await register(userId);
    },
    [authenticate, register],
  );

  const signOut = useCallback(() => {
    const token = getPasskeySessionToken();
    if (token) {
      void backendService.revokePasskeySession(token).catch(() => {});
    }
    clearPasskeySessionToken();
    setState({ status: "idle", message: "Signed out.", sessionToken: null, userId: null });
  }, []);

  return { state, test, signOut, supported: isWebAuthnSupported() };
}
