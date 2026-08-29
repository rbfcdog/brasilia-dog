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

export const backendService = {
  health(): Promise<BackendHealth> {
    return apiFetch<BackendHealth>(backendPath("/health"));
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
};
