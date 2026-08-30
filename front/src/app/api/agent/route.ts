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

function backendConversationMessagesUrl(conversationId: string): URL | null {
  const configuredUrl = process.env.BACKEND_API_URL?.trim();
  if (!configuredUrl) return null;

  const baseUrl = new URL(configuredUrl);
  const normalizedBasePath = baseUrl.pathname.replace(/\/$/, "");
  baseUrl.pathname = `${normalizedBasePath}/v1/conversations/${encodeURIComponent(conversationId)}/messages`;
  return baseUrl;
}

function assistantMessage(payload: unknown): string | null {
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    !isRecord(payload.data) ||
    typeof payload.data.message !== "string" ||
    !payload.data.message.trim()
  ) {
    return null;
  }
  return payload.data.message.trim();
}

async function persistAssistantReply(
  request: Request,
  conversationId: string,
  content: string,
): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const target = backendConversationMessagesUrl(conversationId);
  if (!authorization || !target) return false;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
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

  const responseBody = await upstream.text();
  if (upstream.ok && input.conversationId && request.headers.has("authorization")) {
    let payload: unknown;
    try {
      payload = JSON.parse(responseBody);
    } catch {
      return errorResponse("INVALID_AGENT_RESPONSE", "The agent returned invalid JSON.", 502);
    }
    const content = assistantMessage(payload);
    if (!content || !(await persistAssistantReply(request, input.conversationId, content))) {
      return errorResponse(
        "CONVERSATION_PERSISTENCE_FAILED",
        "The agent reply could not be saved to the backend.",
        502,
      );
    }
  }

  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
