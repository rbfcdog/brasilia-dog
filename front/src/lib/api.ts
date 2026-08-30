import { clearPasskeySessionToken, getPasskeySessionToken } from "@/lib/passkey-session";
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

function isApiEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return typeof payload === "object" && payload !== null && "ok" in payload;
}

function errorFromPayload(payload: unknown, status: number): ApiError {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    const detail =
      "detail" in payload && typeof payload.detail === "string"
        ? ` ${payload.detail}`
        : "";
    return new ApiError(`${payload.error}${detail}`, status, payload.error);
  }

  return new ApiError(`Request failed with status ${status}.`, status);
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

  const sessionToken = getPasskeySessionToken();
  if (sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
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
    if (response.status === 401) clearPasskeySessionToken();
    throw new InvalidJsonResponseError(response.status);
  }

  const payload = (await response.json()) as T | ApiEnvelope<T>;
  if (isApiEnvelope<T>(payload)) {
    if (!response.ok || !payload.ok) {
      if (response.status === 401) clearPasskeySessionToken();
      const error = payload.ok
        ? new ApiError(`Request failed with status ${response.status}.`, response.status)
        : new ApiError(payload.error.message, response.status, payload.error.code);
      throw error;
    }

    return payload.data;
  }

  if (!response.ok) {
    if (response.status === 401) clearPasskeySessionToken();
    throw errorFromPayload(payload, response.status);
  }

  return payload;

}
