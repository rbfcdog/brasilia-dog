export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function chatRequest(body: unknown): { message: string; conversationId?: string } | null {
  if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
    return null;
  }
  if (body.conversationId !== undefined && (typeof body.conversationId !== "string" || !body.conversationId.trim())) {
    return null;
  }

  return {
    message: body.message.trim(),
    ...(typeof body.conversationId === "string"
      ? { conversationId: body.conversationId.trim() }
      : {}),
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "A valid JSON body is required.", 400);
  }

  const input = chatRequest(body);
  if (!input) {
    return errorResponse("INVALID_MESSAGE", "A non-empty message and optional conversation ID are required.", 422);
  }

  const agentBaseUrl = process.env.AGENT_SERVICE_URL;
  const agentServiceToken = process.env.AGENT_SERVICE_TOKEN;
  if (!agentBaseUrl || !agentServiceToken) {
    return errorResponse("AGENT_UNAVAILABLE", "The agent service is not configured.", 503);
  }

  let upstream: Response;
  try {
    upstream = await fetch(new URL("/v1/chat", agentBaseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentServiceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return errorResponse("AGENT_UNAVAILABLE", "The agent service could not be reached.", 502);
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
