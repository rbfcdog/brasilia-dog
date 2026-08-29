import { executeMockPurchase } from "@/mocks/shopping";
import type {
  ApiEnvelope,
  MockPurchaseOutcome,
  PurchaseResponse,
} from "@/types/shopping";

interface PurchaseRequest {
  mandateId?: unknown;
  mockOutcome?: unknown;
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

  const validOutcome =
    body.mockOutcome === "immediate" || body.mockOutcome === "scheduled";

  if (typeof body.mandateId !== "string" || !validOutcome) {
    return Response.json(
      { ok: false, error: { code: "INVALID_PURCHASE", message: "Mandate ID and outcome are required." } },
      { status: 422 },
    );
  }

  const data = await executeMockPurchase(
    body.mandateId,
    body.mockOutcome as MockPurchaseOutcome,
  );
  const response: ApiEnvelope<PurchaseResponse> = { ok: true, data };

  return Response.json(response);
}
