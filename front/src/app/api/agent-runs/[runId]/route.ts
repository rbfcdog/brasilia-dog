import { agent, bffError, verifyOwnerSession } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const session = await verifyOwnerSession(request);
    const { runId } = await context.params;
    const run = await agent<Record<string, unknown>>(`/v1/agent-runs/${encodeURIComponent(runId)}`);
    if (run.ownerId !== session.userId) {
      return Response.json({ ok: false, error: { code: "RUN_NOT_FOUND", message: "Run not found." } }, { status: 404 });
    }
    return Response.json({ ok: true, data: run });
  } catch (error) {
    return bffError(error);
  }
}
