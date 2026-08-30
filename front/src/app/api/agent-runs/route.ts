import {
  BffError, MANDATE_VALIDITY_MS, agent, backend, bffError, normalizeAgentRun, parseProposal, requireIdempotencyKey, verifyOwnerSession,
} from "./_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const key = requireIdempotencyKey(request);
    const session = await verifyOwnerSession(request, true);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.goal !== "string" || !body.goal.trim() || body.goal.length > 2_000
      || (body.conversationId !== undefined && typeof body.conversationId !== "string")) {
      return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "goal and optional conversationId are required." } }, { status: 422 });
    }
    const proposal = parseProposal(body.proposal);
    const identity = await agent<{ algorithm: "Ed25519"; publicKeyJwk: JsonWebKey; fingerprint: string }>("/v1/identity");
    const ensured = await backend<{
      identity: { id: string };
      signingKey: { id: string };
    }>("/v1/agents/ensure", session.token, {
      method: "POST",
      body: JSON.stringify({ displayName: "Nomad Marketplace Agent", ...identity }),
    });
    const mandate = await backend<{ mandate: { id: string } }>("/v1/mandates", session.token, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        agentIdentityId: ensured.identity.id,
        scope: proposal.scope,
        maxAmountMinor: Math.round(proposal.maximumAmount * 100),
        currency: proposal.currency,
        expiresAt: new Date(Date.now() + MANDATE_VALIDITY_MS).toISOString(),
      }),
    });
    const run = await agent<Record<string, unknown>>("/v1/agent-runs", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        goal: body.goal.trim(),
        mandateId: mandate.mandate.id,
        ownerId: session.userId,
        agentIdentityId: ensured.identity.id,
        agentSigningKeyId: ensured.signingKey.id,
        ...(typeof body.conversationId === "string" ? { conversationId: body.conversationId } : {}),
      }),
    });
    return Response.json({ ok: true, data: run }, { status: 202 });
  } catch (error) {
    return bffError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await verifyOwnerSession(request);
    const data = await agent<{ runs: Record<string, unknown>[] }>(`/v1/agent-runs?ownerId=${encodeURIComponent(session.userId)}`);
    return Response.json({ ok: true, data: { runs: data.runs.map(normalizeAgentRun) } });
  } catch (error) {
    // A sandbox backend restart invalidates legacy process-local sessions. The
    // passive navigation badge should degrade to an empty list; a fresh demo
    // assertion is still required before POSTing an executable run.
    if (error instanceof BffError && error.status === 401) {
      return Response.json({ ok: true, data: { runs: [] } });
    }
    return bffError(error);
  }
}
