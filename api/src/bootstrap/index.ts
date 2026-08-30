import { createApp } from '../http/app.js';
import { loadConfig } from '../config/config.js';
import { loadEnvironment } from '../config/environment.js';
import { createMppHandler, createPaidHandler } from '../payments/mpp.js';
import { PaymentAttemptRepository } from '../repositories/payment-attempt-repository.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { SandboxProductRepository } from '../repositories/sandbox-product-repository.js';
import { ProductInfoRepository } from '../repositories/product-info-repository.js';
import { AgentIdentityRepository, InMemoryAgentIdentityRepository } from '../repositories/agent-identity-repository.js';
import { InMemoryMandateRepository, MandateRepository } from '../repositories/mandate-repository.js';
import { PaymentHistoryRepository } from '../repositories/payment-history-repository.js';
import { SellerQuoteRepository } from '../repositories/seller-quote-repository.js';
import { ConversationRepository, InMemoryConversationRepository } from '../repositories/conversation-repository.js';
import { SupabasePasskeyStore, SupabaseSessionStore } from '../repositories/passkey-repository.js';
import { createExpressApp } from '../http/server.js';
import { ProductCatalogService } from '../services/product-catalog-service.js';
import { PaymentService } from '../services/payment-service.js';
import { PasskeyService } from '../services/passkey-service.js';
import { InMemoryPasskeyStore } from '../services/passkey-store.js';
import { RefundService } from '../services/refund-service.js';
import { SessionService, InMemorySessionStore } from '../services/session-service.js';
import { CrossCredentialAuth } from '../services/cross-credential-auth.js';
import { PurchaseService } from '../services/purchase-service.js';
import { SellerAgentVerificationService } from '../services/seller-agent-verification.js';
import { createSupabaseClient } from '../integrations/supabase.js';
import { MerchantService } from '../services/merchant-service.js';
import { UserAuthService } from '../services/user-auth-service.js';
import { InMemoryPasskeyEnrollmentService, PasskeyEnrollmentService } from '../services/passkey-enrollment-service.js';
import { BackendChatService } from '../services/backend-chat-service.js';
import { MarketplaceAuthorityService } from '../services/marketplace-authority-service.js';
import { AgentRefundService } from '../services/agent-refund-service.js';

loadEnvironment();

const config = loadConfig();
const supabase = createSupabaseClient(config.supabase);
const durableProductRepository = supabase ? new ProductRepository(supabase) : null;
const productRepository = config.mode === 'sandbox'
  ? new SandboxProductRepository(config.stripeProfileId)
  : durableProductRepository;
const productCatalogService = durableProductRepository ? new ProductCatalogService(durableProductRepository) : null;
const paymentService = supabase ? new PaymentService({
  stripeProfileId: config.stripeProfileId,
  mppHandlerFactory: (options) => createMppHandler(config, options),
  paymentAttemptRepository: new PaymentAttemptRepository(supabase),
}) : null;
const productInfoRepository = supabase ? new ProductInfoRepository(supabase) : null;
const agentIdentityRepository = config.mode === 'sandbox'
  ? new InMemoryAgentIdentityRepository()
  : supabase
    ? new AgentIdentityRepository(supabase)
    : null;
const mandateRepository = config.mode === 'sandbox'
  ? new InMemoryMandateRepository()
  : supabase
    ? new MandateRepository(supabase)
    : null;
const paymentHistoryRepository = supabase ? new PaymentHistoryRepository(supabase) : null;
const sellerQuoteRepository = supabase ? new SellerQuoteRepository(supabase) : null;
const conversationRepository = config.mode === 'sandbox'
  ? new InMemoryConversationRepository()
  : supabase
    ? new ConversationRepository(supabase)
    : null;
const merchantService = supabase && config.supabase
  ? new MerchantService(supabase, config.stripeProfileId, config.supabase)
  : null;
const userAuthService = supabase ? new UserAuthService(supabase) : null;
const passkeyEnrollmentService = config.mode === 'sandbox'
  ? new InMemoryPasskeyEnrollmentService()
  : supabase
    ? new PasskeyEnrollmentService(supabase)
    : null;
const refundService = new RefundService(config.stripeSecretKey);
const agentRefundService = paymentHistoryRepository
  ? new AgentRefundService(paymentHistoryRepository, refundService)
  : null;
const backendChatService = conversationRepository && config.agentServiceUrl && config.agentServiceOutboundToken
  ? new BackendChatService(
      conversationRepository,
      config.agentServiceUrl,
      config.agentServiceOutboundToken,
      fetch,
      agentRefundService,
    )
  : null;
const marketplaceAuthorityService = mandateRepository && productRepository
  ? new MarketplaceAuthorityService(mandateRepository, productRepository)
  : null;

const sessionStore = config.mode === 'sandbox'
  ? new InMemorySessionStore()
  : supabase
    ? new SupabaseSessionStore(supabase)
    : new InMemorySessionStore();
const sessionService = new SessionService({ secret: config.sessionSecret, store: sessionStore, ttlSeconds: 86_400 });
const sellerAgentVerificationService = new SellerAgentVerificationService(config.sessionSecret);

const passkeyService = new PasskeyService({
  rpName: config.passkey.rpName,
  rpId: config.passkey.rpId,
  origin: config.passkey.origin,
  // Sandbox passkeys are deliberately ephemeral. This keeps the public demo
  // independent of Supabase service-role grants while live mode stays durable.
  store: config.mode === 'sandbox'
    ? new InMemoryPasskeyStore()
    : supabase
      ? new SupabasePasskeyStore(supabase)
      : new InMemoryPasskeyStore(),
  sessionService,
});

const crossCredentialAuth = (agentIdentityRepository && mandateRepository)
  ? new CrossCredentialAuth(sessionService, agentIdentityRepository, mandateRepository)
  : null;

const purchaseService = (crossCredentialAuth && durableProductRepository)
  ? new PurchaseService({
      crossCredentialAuth,
      productRepository: durableProductRepository,
      recordProof: async (params) => {
        if (!supabase) { return ''; }
        const { data, error } = await supabase.rpc('record_agent_execution_proof', {
          p_agent_identity_id: params.agentIdentityId,
          p_agent_signing_key_id: params.agentSigningKeyId,
          p_mandate_id: params.mandateId,
          p_mandate_version: params.mandateVersion,
          p_request_method: params.requestMethod,
          p_request_path: params.requestPath,
          p_request_body_sha256: params.requestBodySha256,
          p_nonce: params.nonce,
          p_issued_at: new Date(params.issuedAt * 1000).toISOString(),
          p_expires_at: new Date(params.expiresAt * 1000).toISOString(),
          p_signature: params.signature,
        });
        if (error || !data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
          throw new Error('Could not record agent execution proof.');
        }
        return data.id;
      },
    })
  : null;

const app = createApp({
  paidHandler: createPaidHandler(config),
  productCatalogService,
  paymentService,
  passkeyService,
  refundService,
  productInfoRepository,
  productRepository,
  agentIdentityRepository,
  mandateRepository,
  paymentHistoryRepository,
  conversationRepository,
  backendChatService,
  purchaseService,
  crossCredentialAuth,
  sellerAgentVerificationService,
  sellerQuoteRepository,
  sessionService,
  demoPasskeyEnabled: true,
  agentServiceToken: config.agentServiceToken,
  merchantService,
  authenticateSupabaseUser: supabase
    ? async (accessToken) => {
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data.user) return null;
        return { id: data.user.id, ...(data.user.email ? { email: data.user.email } : {}) };
      }
    : null,
  userAuthService,
  passkeyEnrollmentService,
  marketplaceAuthorityService,
});
const server = createExpressApp(app).listen(config.port, '0.0.0.0', () => {
  console.log(`Stripe MPP ${config.mode} service listening on http://0.0.0.0:${config.port}`);
});

server.on('error', (error) => {
  console.error('Stripe MPP server failed to start.', error.message);
  process.exitCode = 1;
});


for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close());
}
