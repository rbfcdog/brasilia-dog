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
async function registerPasskey(userId: string, username: string): Promise<PasskeyVerificationResult> {
  const options: PasskeyRegistrationOptions = await backendService.passkeyRegisterOptions(userId, username);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: fromBase64url(options.challenge),
    rp: options.rp,
    user: {
      id: fromBase64url(typeof options.user.id === "string" ? options.user.id : btoa(options.user.id)),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredentialParameters as PublicKeyCredentialParameters[],
    ...(options.authenticatorSelection ? { authenticatorSelection: options.authenticatorSelection as AuthenticatorSelectionCriteria } : {}),
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

  return backendService.passkeyRegisterVerify(userId, {
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
async function authenticatePasskey(userId: string): Promise<PasskeyVerificationResult> {
  const options: PasskeyAuthOptions = await backendService.passkeyAuthOptions(userId);

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64url(options.challenge),
    rpId: options.rpId,
    ...(options.allowCredentials
      ? {
          allowCredentials: options.allowCredentials.map((cred) => ({
            type: cred.type,
            id: fromBase64url(cred.id),
          })),
        }
      : {}),
    userVerification: (options.userVerification as UserVerificationRequirement) ?? "preferred",
    ...(options.timeout ? { timeout: options.timeout } : {}),
  };

  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error("Authentication returned no assertion.");

  const pkAssertion = assertion as PublicKeyCredential;
  const response = pkAssertion.response as AuthenticatorAssertionResponse;
  const authenticatorData = response.authenticatorData ? toBase64url(response.authenticatorData) : null;
  const clientDataJSON = response.clientDataJSON ? toBase64url(response.clientDataJSON) : null;
  const signature = response.signature ? toBase64url(response.signature) : null;

  return backendService.passkeyAuthVerify(userId, {
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

  const register = useCallback(async (userId: string, username: string) => {
    if (!isWebAuthnSupported()) {
      setState({ status: "error", message: "WebAuthn is not supported in this browser.", sessionToken: null, userId: null });
      return;
    }
    setState({ status: "loading", message: "Waiting for biometric prompt...", sessionToken: null, userId: null });
    try {
      const result = await registerPasskey(userId, username);
      if (result.verified) {
        setState({
          status: "success",
          message: result.credentialId
            ? `Passkey registered (credential: ${result.credentialId.slice(0, 8)}...).`
            : "Passkey registered.",
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
    setState({ status: "loading", message: "Waiting for biometric prompt...", sessionToken: null, userId: null });
    try {
      const result = await authenticatePasskey(userId);
      if (result.verified && result.sessionToken) {
        storePasskeySessionToken(result.sessionToken);
        setState({
          status: "success",
          message: "Authentication successful.",
          sessionToken: result.sessionToken,
          userId: result.userId ?? userId,
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

  const signOut = useCallback(() => {
    const token = getPasskeySessionToken();
    if (token) {
      void backendService.revokePasskeySession(token).catch(() => {});
    }
    clearPasskeySessionToken();
    setState({ status: "idle", message: "Signed out.", sessionToken: null, userId: null });
  }, []);

  return { state, register, authenticate, signOut, supported: isWebAuthnSupported() };
}
