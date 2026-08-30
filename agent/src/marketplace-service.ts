import type { AgentChatRequest } from './chat.js';
import type { StartRunRequest, ResumeRunRequest } from './contracts.js';
import type { CatalogProduct } from './adapters.js';
import { PersistentAgentIdentity } from './agent-identity.js';
import { MarketplaceAuthorityClient } from './marketplace-authority-client.js';
import type { MarketplaceRunState } from './marketplace-contracts.js';
import { DurableRunRepository, type ClaimedMarketplaceRun } from './durable-run-repository.js';
import { AgentError, toAgentError } from './errors.js';
import type { MarketplaceSelector } from './marketplace-selector.js';
import type { AgentService } from './service.js';

export class MarketplaceRunService {
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly options: {
    repository: DurableRunRepository;
    authority: MarketplaceAuthorityClient;
    selector: MarketplaceSelector;
    identity: PersistentAgentIdentity;
    legacy: AgentService;
    workerId: string;
  }) {}

  identity() {
    return this.options.identity.public();
  }

  async start(idempotencyKey: string, request: StartRunRequest) {
    if (!request.ownerId || !request.agentIdentityId || !request.agentSigningKeyId) {
      throw new AgentError('INVALID_REQUEST', 'ownerId and the ensured agent identity are required.', 400);
    }
    return this.options.repository.createOrGet({
      idempotencyKey,
      ownerId: request.ownerId,
      mandateId: request.mandateId,
      goal: request.goal,
      ...(request.conversationId ? { conversationId: request.conversationId } : {}),
      agentIdentityId: request.agentIdentityId,
      agentSigningKeyId: request.agentSigningKeyId,
    });
  }

  get(runId: string) { return this.options.repository.get(runId); }
  list(ownerId: string) { return this.options.repository.list(ownerId); }

  async resume(runId: string, idempotencyKey: string, request: ResumeRunRequest) {
    if (!request.extensionId) throw new AgentError('INVALID_REQUEST', 'extensionId is required.', 400);
    return this.options.repository.resume(runId, idempotencyKey, request.extensionId);
  }

  chat(request: AgentChatRequest) { return this.options.legacy.chat(request); }
  listProducts(): Promise<CatalogProduct[]> { return this.options.legacy.listProducts(); }

  startWorker(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref();
  }

  stopWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const runs = await this.options.repository.claim(this.options.workerId);
      await Promise.all(runs.map((run) => this.process(run)));
    } catch (error) {
      console.error(JSON.stringify({ event: 'agent_worker_tick_failed', error: toAgentError(error).code }));
    } finally {
      this.ticking = false;
    }
  }

  private async process(run: ClaimedMarketplaceRun): Promise<void> {
    let state: MarketplaceRunState = run.state;
    try {
      await this.options.repository.appendEvent(run.id, 'poll_started');
      const snapshot = await this.options.authority.candidates(run.mandate_id);
      state = { ...state, mandate: snapshot.mandate, candidates: snapshot.candidates };

      if (snapshot.mandate.status === 'revoked') {
        await this.options.repository.appendEvent(run.id, 'mandate_revoked');
        await this.options.repository.transition(run.id, {
          status: 'rejected', state,
          result: { outcome: 'rejected', reasonCode: 'MANDATE_REVOKED', message: 'The owner revoked the mandate.' },
        });
        return;
      }

      if (Date.parse(snapshot.mandate.expiresAt) <= Date.now()) {
        state = {
          ...state,
          extensionRequest: {
            mandateId: snapshot.mandate.id,
            expiredAt: snapshot.mandate.expiresAt,
            requestedAt: new Date().toISOString(),
          },
        };
        await this.options.repository.appendEvent(run.id, 'extension_requested', { mandateVersion: snapshot.mandate.version });
        await this.options.repository.transition(run.id, { status: 'waiting_for_extension', state });
        return;
      }

      await this.options.repository.appendEvent(run.id, 'candidates_scanned', { count: snapshot.candidates.length });
      if (snapshot.candidates.length === 0) {
        await this.options.repository.transition(run.id, {
          status: 'monitoring', state, nextPollAt: new Date(Date.now() + 3_000).toISOString(),
        });
        return;
      }

      const selection = await this.options.selector.select({
        goal: run.goal, mandate: snapshot.mandate, candidates: snapshot.candidates,
      });
      state = {
        ...state,
        selectedProduct: selection.selected,
        selectionRationale: selection.rationale,
        authorityChecks: [{ name: 'candidate_authorized_by_api', passed: true, checkedAt: new Date().toISOString() }],
      };
      await this.options.repository.appendEvent(run.id, 'product_selected', {
        slug: selection.selected.slug,
        merchantId: selection.selected.merchant.id,
        amountMinor: selection.selected.offering.amountMinor,
      });
      const payment = await this.options.authority.purchase({
        runId: run.id,
        mandate: snapshot.mandate,
        product: selection.selected,
        agentIdentityId: state.agentIdentityId,
        agentSigningKeyId: state.agentSigningKeyId,
      });
      state = {
        ...state,
        proofId: payment.proofId,
        paymentAttempt: payment.paymentAttempt,
        receipt: payment.receipt,
        authorityChecks: [
          ...state.authorityChecks,
          { name: 'mandate_revalidated_before_payment', passed: true, checkedAt: new Date().toISOString() },
          { name: 'stripe_receipt_settled', passed: true, checkedAt: new Date().toISOString() },
        ],
      };
      await this.options.repository.appendEvent(run.id, 'purchase_settled', {
        proofId: payment.proofId,
        paymentAttemptId: payment.paymentAttempt.id,
        receiptReference: payment.receipt.reference,
      });
      await this.options.repository.transition(run.id, {
        status: 'completed', state,
        result: { outcome: 'completed', productSlug: selection.selected.slug, receipt: payment.receipt },
      });
    } catch (error) {
      const failure = toAgentError(error);
      const rejected = failure.code === 'MANDATE_REJECTED';
      await this.options.repository.appendEvent(run.id, rejected ? 'purchase_rejected' : 'run_failed', { code: failure.code });
      await this.options.repository.transition(run.id, {
        status: rejected ? 'rejected' : 'failed', state,
        result: { outcome: rejected ? 'rejected' : 'failed', code: failure.code, message: failure.message },
      });
    }
  }
}
