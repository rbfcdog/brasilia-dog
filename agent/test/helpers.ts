import { randomUUID } from 'node:crypto';
import type { AgentAdapters } from '../src/adapters.js';
import type { PublicRun, RunStatus } from '../src/contracts.js';
import { DemoBackend } from '../src/demo.js';
import { silentStepLogger } from '../src/graph.js';
import { AgentService } from '../src/service.js';
import { FakeFlightSelector, type FlightSelector } from '../src/selector.js';

export function createHarness({
  backend = new DemoBackend(),
  selector = new FakeFlightSelector(),
  adapters = backend,
  now,
}: {
  backend?: DemoBackend;
  selector?: FlightSelector;
  adapters?: AgentAdapters;
  now?: () => Date;
} = {}) {
  const service = new AgentService({
    adapters,
    selector,
    logger: silentStepLogger,
    ...(now ? { now } : {}),
  });
  return { backend, selector, service };
}

export function startDemoRun(service: AgentService, goal = 'Buy a flight to Córdoba below USD 150'): PublicRun {
  return service.start(randomUUID(), {
    goal,
    mandateId: 'mandate-vuelaya-cordoba',
  });
}

export async function waitForStatus(
  service: AgentService,
  runId: string,
  expected: RunStatus | RunStatus[],
  timeoutMs = 3_000,
): Promise<PublicRun> {
  const statuses = Array.isArray(expected) ? expected : [expected];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = service.get(runId);
    if (statuses.includes(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not reach ${statuses.join(', ')}. Current status: ${service.get(runId).status}`);
}
