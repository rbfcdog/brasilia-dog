import { executeMockPurchase } from "@/mocks/shopping";
import type {
  ApiEnvelope,
  Mandate,
  PaymentMethod,
  PurchaseResponse,
} from "@/types/shopping";

interface PurchaseRequest {
  mandate?: unknown;
  paymentMethod?: unknown;
}

function isMandate(value: unknown): value is Mandate {
  if (typeof value !== "object" || value === null) return false;
  const mandate = value as Partial<Mandate>;
  return typeof mandate.id === "string"
    && typeof mandate.scope === "string"
    && typeof mandate.maximumAmount === "number"
    && Number.isFinite(mandate.maximumAmount)
    && mandate.maximumAmount > 0
    && typeof mandate.validUntil === "string"
    && typeof mandate.validityHours === "number"
    && mandate.validityHours > 0
    && typeof mandate.paymentMethodId === "string"
    && (mandate.mockOutcome === "immediate" || mandate.mockOutcome === "scheduled");
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  if (typeof value !== "object" || value === null) return false;
  const method = value as Partial<PaymentMethod>;
  return typeof method.id === "string"
    && typeof method.label === "string"
    && (method.brand === "Visa" || method.brand === "Mastercard" || method.brand === "Amex")
    && typeof method.last4 === "string"
    && /^\d{4}$/.test(method.last4)
    && typeof method.expiry === "string";
}

export async function POST(request: Request) {
  let body: PurchaseRequest;

  try {
    body = (await request.json()) as PurchaseRequest;
  } catch {
    return Response.json(
      { ok: false, error: { code: "INVALID_JSON", message: "A valid JSON body is required." } },
      { status: 400 },
    );
  }

  if (
    !isMandate(body.mandate)
    || !isPaymentMethod(body.paymentMethod)
    || body.mandate.paymentMethodId !== body.paymentMethod.id
  ) {
    return Response.json(
      { ok: false, error: { code: "INVALID_PURCHASE", message: "A complete mandate and payment method are required." } },
      { status: 422 },
    );
  }

  const data = await executeMockPurchase(body.mandate, body.paymentMethod);
  const response: ApiEnvelope<PurchaseResponse> = { ok: true, data };

  return Response.json(response);
}
