import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoBackend } from '../src/demo.js';
import { silentStepLogger } from '../src/graph.js';
import { AgentService } from '../src/service.js';
import { OpenAIFlightSelector } from '../src/selector.js';
import { startDemoRun, waitForStatus } from './helpers.js';

const liveEnabled = process.env.LIVE_OPENAI === '1';

test('live OpenAI smoke selects a valid VuelaYa offer and completes', {
  skip: liveEnabled ? false : 'Run npm run test:live to enable the real OpenAI smoke test.',
  timeout: 60_000,
}, async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  assert.ok(apiKey, 'Set OPENAI_API_KEY in the environment before running npm run test:live.');
  assert.ok(model, 'Set OPENAI_MODEL in the environment before running npm run test:live.');

  const backend = new DemoBackend();
  const service = new AgentService({
    adapters: backend,
    selector: new OpenAIFlightSelector({ apiKey, model }),
    logger: silentStepLogger,
  });
  const run = await waitForStatus(
    service,
    startDemoRun(service).runId,
    ['completed', 'failed'],
    55_000,
  );

  assert.equal(run.status, 'completed', JSON.stringify(run.result));
  assert.equal(run.result?.outcome, 'allowed');
  assert.equal(backend.presentations.length, 1);
  const signedIntent = JSON.parse(backend.presentations[0]!.rawBody) as {
    offer: { offerId: string };
    agentClaim: { rationale: string; consideredOfferIds: string[] };
  };
  assert.equal(signedIntent.offer.offerId, 'vuelaya-cordoba-130');
  assert.ok(signedIntent.agentClaim.rationale.length > 0);
  assert.deepEqual(signedIntent.agentClaim.consideredOfferIds, [
    'vuelaya-cordoba-130',
    'vuelaya-cordoba-300',
  ]);
});
