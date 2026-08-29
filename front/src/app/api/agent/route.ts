import { analyzeMockRequest } from "@/mocks/shopping";
import type { ApiEnvelope, AgentResponse, ChatMessage } from "@/types/shopping";

interface AgentRequest {
  message?: unknown;
  conversationContext?: unknown;
}

export async function POST(request: Request) {
  let body: AgentRequest;

  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return Response.json(
      { ok: false, error: { code: "INVALID_JSON", message: "A valid JSON body is required." } },
      { status: 400 },
    );
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json(
      { ok: false, error: { code: "INVALID_MESSAGE", message: "A non-empty message is required." } },
      { status: 422 },
    );
  }

  if (/test payment challenge/i.test(body.message)) {
    return Response.json(
      { ok: false, error: { code: "PAYMENT_REQUIRED", message: "A payment credential is required." } },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": 'Payment realm="mock-marketplace", method="stripe"',
        },
      },
    );
  }

  const context = Array.isArray(body.conversationContext)
    ? (body.conversationContext as ChatMessage[])
    : [];
  const data = await analyzeMockRequest(body.message, context);
  const response: ApiEnvelope<AgentResponse> = { ok: true, data };

  return Response.json(response);
}
