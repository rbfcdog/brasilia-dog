import { randomBytes } from 'node:crypto';
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { z } from 'zod';
import type { AgentAdapters } from './adapters.js';
import {
  agentClaimSchema,
  purchaseIntentSchema,
  resumeIntentSchema,
  type AgentClaim,
  type AgentProof,
  type FlightOffer,
  type FlightSelection,
  type MandateView,
  type PurchaseIntent,
  type ResumeVerificationResult,
  type VerificationResult,
} from './contracts.js';
import { encodeAgentProof, sha256Utf8 } from './crypto.js';
import { AgentError } from './errors.js';
import type { RunStore } from './run-store.js';
import {
  InvalidModelOutputError,
  parseFlightSelection,
  type FlightSelector,
} from './selector.js';

export interface StepLogger {
  log(entry: {
    runId: string;
    step: string;
    durationMs: number;
    outcome: 'ok' | 'failed';
  }): void;
}

export const consoleStepLogger: StepLogger = {
  log(entry) {
    console.info(JSON.stringify(entry));
  },
};

export const silentStepLogger: StepLogger = { log() {} };

interface TerminalState {
  outcome: 'allowed' | 'rejected' | 'no_offer';
  verification?: ResumeVerificationResult;
}

interface ResumeCommandValue {
  approvalResolutionId: string;
  idempotencyKey: string;
}

const resumeCommandSchema = z.strictObject({
  approvalResolutionId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
});

const AgentState = Annotation.Root({
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  mandateId: Annotation<string>(),
  purchaseIdempotencyKey: Annotation<string>(),
  mandate: Annotation<MandateView | undefined>(),
  offers: Annotation<FlightOffer[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  selection: Annotation<FlightSelection | undefined>(),
  claim: Annotation<AgentClaim | undefined>(),
  purchaseIntent: Annotation<PurchaseIntent | undefined>(),
  purchaseRawBody: Annotation<string | undefined>(),
  purchaseProof: Annotation<AgentProof | undefined>(),
  verification: Annotation<VerificationResult | undefined>(),
  approvalResolutionId: Annotation<string | undefined>(),
  resumeIdempotencyKey: Annotation<string | undefined>(),
  resumeRawBody: Annotation<string | undefined>(),
  resumeProof: Annotation<AgentProof | undefined>(),
  terminal: Annotation<TerminalState | undefined>(),
});

export type AgentGraphState = typeof AgentState.State;
export type AgentGraphResult = AgentGraphState & {
  __interrupt__?: Array<{ value: unknown }>;
};

export interface AgentGraph {
  invokeInitial(input: {
    runId: string;
    goal: string;
    mandateId: string;
    idempotencyKey: string;
  }): Promise<AgentGraphResult>;
  resume(runId: string, value: ResumeCommandValue): Promise<AgentGraphResult>;
}

export function createAgentGraph({
  adapters,
  selector,
  store,
  logger = consoleStepLogger,
  now = () => new Date(),
}: {
  adapters: AgentAdapters;
  selector: FlightSelector;
  store: RunStore;
  logger?: StepLogger;
  now?: () => Date;
}): AgentGraph {
  async function step<T>(runId: string, name: string, operation: () => Promise<T> | T): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await operation();
      logger.log({
        runId,
        step: name,
        durationMs: Math.round(performance.now() - startedAt),
        outcome: 'ok',
      });
      return result;
    } catch (error) {
      logger.log({
        runId,
        step: name,
        durationMs: Math.round(performance.now() - startedAt),
        outcome: 'failed',
      });
      throw error;
    }
  }

  const builder = new StateGraph(AgentState)
    .addNode('load_mandate', async (state) => step(state.runId, 'load_mandate', async () => {
      const mandate = await adapters.mandates.getMandate(state.mandateId);
      store.appendEvent(state.runId, 'mandate_loaded', {
        mandateId: mandate.id,
        mandateVersion: mandate.version,
        status: mandate.status,
      });
      return { mandate };
    }))
    .addNode('search_offers', async (state) => step(state.runId, 'search_offers', async () => {
      const mandate = requireValue(state.mandate, 'mandate');
      const offers = await adapters.catalog.searchFlights({ goal: state.goal, mandate });
      const availableOffers = offers.filter((offer) => offer.available);
      store.appendEvent(state.runId, 'offers_discovered', {
        count: availableOffers.length,
        offerIds: availableOffers.map((offer) => offer.offerId),
      });
      return { offers: availableOffers };
    }))
    .addNode('select_offer', async (state) => step(state.runId, 'select_offer', async () => {
      if (state.offers.length === 0) {
        return { terminal: { outcome: 'no_offer' } satisfies TerminalState };
      }

      const mandate = requireValue(state.mandate, 'mandate');
      let lastValidationError = 'invalid structured output';
      for (const attempt of [1, 2] as const) {
        try {
          const candidate = parseFlightSelection(await selector.select({
            goal: state.goal,
            mandate,
            offers: state.offers,
            attempt,
            ...(attempt === 2 ? { previousValidationError: lastValidationError } : {}),
          }));
          const selected = state.offers.find((offer) => offer.offerId === candidate.selectedOfferId);
          if (!selected) {
            throw new InvalidModelOutputError('The selected offer ID is not present in the catalog response.');
          }

          const cheapest = [...state.offers].sort((left, right) => left.amountMinor - right.amountMinor)[0];
          const selection = candidate.semanticEscalationRequested && cheapest
            ? {
                ...candidate,
                selectedOfferId: cheapest.offerId,
                rationale: candidate.selectedOfferId === cheapest.offerId
                  ? candidate.rationale
                  : `${cheapest.offerId} is the cheapest available offer; human review is requested because no offer satisfies the goal.`,
              }
            : candidate;

          store.appendEvent(state.runId, 'offer_selected', {
            offerId: selection.selectedOfferId,
            semanticEscalationRequested: selection.semanticEscalationRequested,
          });
          return { selection };
        } catch (error) {
          if (!(error instanceof InvalidModelOutputError)) {
            throw error;
          }
          lastValidationError = error.message;
          if (attempt === 2) {
            throw new InvalidModelOutputError(
              'The model returned invalid output twice; the run was stopped before purchase.',
              { cause: error },
            );
          }
        }
      }

      throw new InvalidModelOutputError();
    }))
    .addNode('build_agent_claim', async (state) => step(state.runId, 'build_agent_claim', () => {
      const mandate = requireValue(state.mandate, 'mandate');
      const selection = requireValue(state.selection, 'selection');
      const offer = requireValue(
        state.offers.find((candidate) => candidate.offerId === selection.selectedOfferId),
        'selected offer',
      );
      const selectedOffer = {
        offerId: offer.offerId,
        merchantId: offer.merchantId,
        category: offer.category,
        destination: offer.destination,
        amountMinor: offer.amountMinor,
        currency: offer.currency,
      } as const;
      const claim = agentClaimSchema.parse({
        goal: state.goal,
        selectedOffer,
        consideredOfferIds: state.offers.map((candidate) => candidate.offerId),
        rationale: selection.rationale,
        semanticEscalationRequested: selection.semanticEscalationRequested,
      });
      const purchaseIntent = purchaseIntentSchema.parse({
        schemaVersion: 'purchase-intent-v1',
        runId: state.runId,
        mandate: { id: mandate.id, version: mandate.version },
        offer: selectedOffer,
        agentClaim: claim,
      });

      // This is the only serialization of the Layer A evidence body.
      const purchaseRawBody = JSON.stringify(purchaseIntent);
      return { claim, purchaseIntent, purchaseRawBody };
    }))
    .addNode('request_remote_signature', async (state) => step(state.runId, 'request_remote_signature', async () => {
      const mandate = requireValue(state.mandate, 'mandate');
      const purchaseRawBody = requireValue(state.purchaseRawBody, 'purchase body');
      const issuedAt = Math.floor(now().getTime() / 1_000);
      const purchaseProof = await adapters.signer.sign({
        bodySha256: sha256Utf8(purchaseRawBody),
        mandateId: mandate.id,
        mandateVersion: mandate.version,
        method: 'POST',
        path: '/v1/purchase-attempts',
        nonce: randomBytes(18).toString('base64url'),
        issuedAt,
        expiresAt: issuedAt + 60,
      });
      return { purchaseProof };
    }))
    .addNode('present_purchase', async (state) => step(state.runId, 'present_purchase', async () => {
      const verification = await adapters.purchases.presentPurchase({
        rawBody: requireValue(state.purchaseRawBody, 'purchase body'),
        encodedProof: encodeAgentProof(requireValue(state.purchaseProof, 'purchase proof')),
        idempotencyKey: state.purchaseIdempotencyKey,
      });
      store.appendEvent(state.runId, 'purchase_presented', {
        outcome: verification.outcome,
        attemptId: verification.attemptId,
      });
      if (verification.outcome === 'escalation_required') {
        store.appendEvent(state.runId, 'human_approval_required', {
          attemptId: verification.attemptId,
          approvalRequestId: verification.approvalRequest.approvalRequestId,
          requestedAmountMinor: verification.approvalRequest.requestedAmountMinor,
          mandateLimitMinor: verification.approvalRequest.mandateLimitMinor,
          currency: verification.approvalRequest.currency,
        });
      }
      return { verification };
    }))
    .addNode('wait_for_human', (state) => {
      const verification = requireValue(state.verification, 'verification result');
      if (verification.outcome !== 'escalation_required') {
        throw new AgentError('GRAPH_STATE_INVALID', 'The graph cannot wait without an escalation request.');
      }

      // Keep this node side-effect free: LangGraph restarts it when Command(resume) is received.
      const resumed = resumeCommandSchema.parse(interrupt({
        attemptId: verification.attemptId,
        approvalRequest: verification.approvalRequest,
      })) as ResumeCommandValue;
      return {
        approvalResolutionId: resumed.approvalResolutionId,
        resumeIdempotencyKey: resumed.idempotencyKey,
      };
    })
    .addNode('sign_resume_request', async (state) => step(state.runId, 'sign_resume_request', async () => {
      const mandate = requireValue(state.mandate, 'mandate');
      const verification = requireValue(state.verification, 'verification result');
      if (verification.outcome !== 'escalation_required') {
        throw new AgentError('GRAPH_STATE_INVALID', 'The graph cannot resume without an escalation request.');
      }

      const resumeIntent = resumeIntentSchema.parse({
        approvalResolutionId: requireValue(state.approvalResolutionId, 'approval resolution'),
      });
      const resumeRawBody = JSON.stringify(resumeIntent);
      const issuedAt = Math.floor(now().getTime() / 1_000);
      const resumeProof = await adapters.signer.sign({
        bodySha256: sha256Utf8(resumeRawBody),
        mandateId: mandate.id,
        mandateVersion: mandate.version,
        method: 'POST',
        path: `/v1/purchase-attempts/${verification.attemptId}/resume`,
        nonce: randomBytes(18).toString('base64url'),
        issuedAt,
        expiresAt: issuedAt + 60,
      });
      return { resumeRawBody, resumeProof };
    }))
    .addNode('resume_purchase', async (state) => step(state.runId, 'resume_purchase', async () => {
      const verification = requireValue(state.verification, 'verification result');
      if (verification.outcome !== 'escalation_required') {
        throw new AgentError('GRAPH_STATE_INVALID', 'The graph cannot resume without an escalation request.');
      }
      const resumeVerification = await adapters.purchases.resumePurchase(verification.attemptId, {
        rawBody: requireValue(state.resumeRawBody, 'resume body'),
        encodedProof: encodeAgentProof(requireValue(state.resumeProof, 'resume proof')),
        idempotencyKey: requireValue(state.resumeIdempotencyKey, 'resume idempotency key'),
      });
      store.appendEvent(state.runId, 'purchase_presented', {
        outcome: resumeVerification.outcome,
        attemptId: resumeVerification.attemptId,
        resumed: true,
      });
      return { terminal: { outcome: resumeVerification.outcome, verification: resumeVerification } satisfies TerminalState };
    }))
    .addNode('completed', async (state) => step(state.runId, 'completed', () => {
      const verification = requireValue(state.verification, 'verification result');
      if (verification.outcome !== 'allowed') {
        throw new AgentError('GRAPH_STATE_INVALID', 'An allowed result is required to complete the purchase.');
      }
      return { terminal: { outcome: 'allowed', verification } satisfies TerminalState };
    }))
    .addNode('rejected', async (state) => step(state.runId, 'rejected', () => {
      const verification = requireValue(state.verification, 'verification result');
      if (verification.outcome !== 'rejected') {
        throw new AgentError('GRAPH_STATE_INVALID', 'A rejected result is required to reject the purchase.');
      }
      return { terminal: { outcome: 'rejected', verification } satisfies TerminalState };
    }))
    .addNode('no_offer', async (state) => step(state.runId, 'no_offer', () => ({
      terminal: { outcome: 'no_offer' } satisfies TerminalState,
    })))
    .addEdge(START, 'load_mandate')
    .addEdge('load_mandate', 'search_offers')
    .addEdge('search_offers', 'select_offer')
    .addConditionalEdges('select_offer', (state) => state.terminal?.outcome === 'no_offer' ? 'no_offer' : 'build_agent_claim', {
      no_offer: 'no_offer',
      build_agent_claim: 'build_agent_claim',
    })
    .addEdge('build_agent_claim', 'request_remote_signature')
    .addEdge('request_remote_signature', 'present_purchase')
    .addConditionalEdges('present_purchase', (state) => requireValue(state.verification, 'verification result').outcome, {
      allowed: 'completed',
      rejected: 'rejected',
      escalation_required: 'wait_for_human',
    })
    .addEdge('wait_for_human', 'sign_resume_request')
    .addEdge('sign_resume_request', 'resume_purchase')
    .addEdge('resume_purchase', END)
    .addEdge('completed', END)
    .addEdge('rejected', END)
    .addEdge('no_offer', END);

  const graph = builder.compile({ checkpointer: new MemorySaver() });

  return {
    async invokeInitial(input) {
      return await graph.invoke({
        runId: input.runId,
        goal: input.goal,
        mandateId: input.mandateId,
        purchaseIdempotencyKey: input.idempotencyKey,
        offers: [],
      }, configFor(input.runId)) as AgentGraphResult;
    },
    async resume(runId, value) {
      return await graph.invoke(
        new Command({ resume: value }),
        configFor(runId),
      ) as AgentGraphResult;
    },
  };
}

function configFor(runId: string): { configurable: { thread_id: string } } {
  return { configurable: { thread_id: runId } };
}

function requireValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new AgentError('GRAPH_STATE_INVALID', `The graph state is missing ${name}.`);
  }
  return value;
}
