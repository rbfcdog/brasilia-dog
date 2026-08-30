import { apiFetch } from "@/lib/api";

const BACKEND_PROXY_PREFIX = "/api/backend";

export interface BackendHealth {
  status: "ok";
}

export interface VerifiedPasskeySession {
  valid: true;
  userId: string;
  expiresAt: string;
}

export interface ProductInfo {
  slug: string;
  title: string;
  description: string | null;
  status: string;
}

function backendPath(pathname: string): string {
  return `${BACKEND_PROXY_PREFIX}${pathname}`;
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
}

export interface PasskeyAuthOptions {
  challenge: string;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
  timeout?: number;
}

export interface PasskeyVerificationResult {
  verified: boolean;
  credentialId?: string;
  sessionToken?: string;
  sessionExpiresAt?: number;
}

export interface PasskeyRegistrationStatus {
  registered: boolean;
  credentialCount: number;
}

export interface PasskeyEnrollment {
  enrollmentUrl: string;
  expiresAt: string;
}

export interface BackendConversation {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationMessageInput {
  role: BackendConversationMessage["role"];
  content: string;
  createdAt: string;
}

export interface BackendConversationEvent {
  id: string;
  conversationId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationEventInput {
  type: BackendConversationEvent["type"];
  payload: Record<string, unknown>;
  createdAt: string;
}

export const backendService = {
  health(): Promise<BackendHealth> {
    return apiFetch<BackendHealth>(backendPath("/health"));
  },

  passkeyStatus(): Promise<PasskeyRegistrationStatus> {
    return apiFetch<PasskeyRegistrationStatus>(backendPath("/v1/passkeys/status"));
  },

  createPasskeyEnrollment(): Promise<PasskeyEnrollment> {
    return apiFetch<PasskeyEnrollment>("/api/passkey/enrollment", { method: "POST" });
  },

  passkeyRegisterOptions(): Promise<PasskeyRegistrationOptions> {
    return apiFetch<PasskeyRegistrationOptions>(backendPath("/passkey/register/options"), {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  passkeyRegisterVerify(response: unknown): Promise<PasskeyVerificationResult> {
    return apiFetch<PasskeyVerificationResult>(backendPath("/passkey/register/verify"), {
      method: "POST",
      body: JSON.stringify({ response }),
    });
  },

  passkeyAuthOptions(): Promise<PasskeyAuthOptions> {
    return apiFetch<PasskeyAuthOptions>(backendPath("/passkey/auth/options"), {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  passkeyAuthVerify(response: unknown): Promise<PasskeyVerificationResult> {
    return apiFetch<PasskeyVerificationResult>(backendPath("/passkey/auth/verify"), {
      method: "POST",
      body: JSON.stringify({ response }),
    });
  },
  demoPasskeyVerify(): Promise<PasskeyVerificationResult & { demo: true }> {
    return apiFetch<PasskeyVerificationResult & { demo: true }>(backendPath("/passkey/demo/verify"), {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  verifyPasskeySession(sessionToken: string): Promise<VerifiedPasskeySession> {
    return apiFetch<VerifiedPasskeySession>(backendPath("/passkey/session/verify"), {
      method: "POST",
      body: JSON.stringify({ sessionToken }),
    });
  },

  revokePasskeySession(sessionToken: string): Promise<{ revoked: true }> {
    return apiFetch<{ revoked: true }>(backendPath("/passkey/session/revoke"), {
      method: "POST",
      body: JSON.stringify({ sessionToken }),
    });
  },

  productInfo(slug: string): Promise<{ product: ProductInfo }> {
    return apiFetch<{ product: ProductInfo }>(
      backendPath(`/v1/products/${encodeURIComponent(slug)}/info`),
    );
  },

  listConversations(): Promise<{ conversations: BackendConversation[] }> {
    return apiFetch<{ conversations: BackendConversation[] }>(backendPath("/v1/conversations"));
  },

  createConversation(): Promise<{ conversation: BackendConversation }> {
    return apiFetch<{ conversation: BackendConversation }>(backendPath("/v1/conversations"), {
      method: "POST",
    });
  },

  conversationMessages(conversationId: string): Promise<{ messages: BackendConversationMessage[] }> {
    return apiFetch<{ messages: BackendConversationMessage[] }>(
      backendPath(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`),
    );
  },

  appendConversationMessage(
    conversationId: string,
    message: ConversationMessageInput,
  ): Promise<{ message: BackendConversationMessage }> {
    return apiFetch<{ message: BackendConversationMessage }>(
      backendPath(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`),
      {
        method: "POST",
        body: JSON.stringify(message),
      },
    );
  },

  appendConversationEvent(
    conversationId: string,
    event: ConversationEventInput,
  ): Promise<{ event: BackendConversationEvent }> {
    return apiFetch<{ event: BackendConversationEvent }>(
      backendPath(`/v1/conversations/${encodeURIComponent(conversationId)}/events`),
      {
        method: "POST",
        body: JSON.stringify(event),
      },
    );
  },
};
