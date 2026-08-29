import { getSupabaseAccessToken } from "@/lib/supabase";
import type { ApiEnvelope, PaymentChallenge } from "@/types/shopping";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "HTTP_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class InvalidJsonResponseError extends ApiError {
  constructor(status: number) {
    super("The service returned an unsupported response format.", status, "INVALID_JSON_RESPONSE");
    this.name = "InvalidJsonResponseError";
  }
}

export class PaymentChallengeError extends ApiError {
  constructor(public readonly challenge: PaymentChallenge) {
    super(challenge.message, 402, "PAYMENT_CHALLENGE");
    this.name = "PaymentChallengeError";
  }
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const accessToken = await getSupabaseAccessToken();
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(input, { ...init, headers });
  const authenticateHeader = response.headers.get("WWW-Authenticate");

  if (
    response.status === 402 &&
    authenticateHeader?.trimStart().startsWith("Payment")
  ) {
    const challenge: PaymentChallenge = {
      scheme: "Payment",
      status: 402,
      headerPresent: true,
      message: "A Stripe MPP payment challenge was intercepted before any payment was attempted.",
    };
    console.warn("Payment challenge intercepted", {
      scheme: challenge.scheme,
      status: challenge.status,
    });
    throw new PaymentChallengeError(challenge);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new InvalidJsonResponseError(response.status);
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok) {
    const error = envelope.ok
      ? { code: "HTTP_ERROR", message: `Request failed with status ${response.status}.` }
      : envelope.error;
    throw new ApiError(error.message, response.status, error.code);
  }

  return envelope.data;
}
