import { agent, backend, bffError, requireIdempotencyKey, verifyOwnerSession } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const key = requireIdempotencyKey(request);
    const session = await verifyOwnerSession(request, true);
    const { runId } = await context.params;
    const run = await agent<Record<string, unknown>>(`/v1/agent-runs/${encodeURIComponent(runId)}`);
    if (run.ownerId !== session.userId || typeof run.mandateId !== "string") {
      return Response.json({ ok: false, error: { code: "RUN_NOT_FOUND", message: "Run not found." } }, { status: 404 });
    }
    const { extension } = await backend<{ extension: { extensionId: string } }>(
      `/v1/mandates/${encodeURIComponent(run.mandateId)}/extend`, session.token,
      { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ runId }) },
    );
    const resumed = await agent<Record<string, unknown>>(`/v1/agent-runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ extensionId: extension.extensionId }),
    });
    return Response.json({ ok: true, data: resumed }, { status: 202 });
  } catch (error) {
    return bffError(error);
  }
}
