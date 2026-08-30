export type StripeMode = 'sandbox' | 'live';
export type ProductRail = 'stripe_mpp';
export type ProductMethod = 'GET' | 'POST';

export interface SupabaseConfig {
  url: string;
  key: string;
}

export interface AppConfig {
  port: number;
  mode: StripeMode;
  mppSecretKey: string;
  stripeSecretKey: string;
  stripeProfileId: string;
  supabase: SupabaseConfig | null;
  passkey: PasskeyConfig;
  sessionSecret: string;
  agentServiceToken: string | null;
  agentServiceUrl: string | null;
}

export interface PasskeyConfig {
  rpName: string;
  rpId: string;
  origin: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface ProductOffering {
  id: string;
  rail: ProductRail;
  amountMinor: number;
  currency: string;
  scale: number;
  networkId: string | null;
}

export interface ProductEndpoint {
  id: string;
  method: ProductMethod;
  path: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  offering: ProductOffering;
  product: Product;
}

export interface ProductCatalogEntry extends Product {
  status: 'draft' | 'published' | 'archived';
  metadata: Record<string, unknown>;
  offering: ProductOffering & { active: boolean };
  endpoint: {
    id: string;
    method: ProductMethod;
    path: string;
    enabled: boolean;
  };
}

export interface ProductCatalogSearch {
  query: string | null;
  category: string | null;
  maximumAmountMinor: number | null;
  slugs: string[];
  limit: number;
}

export interface ProductCatalogRepository {
  listCatalog(): Promise<ProductCatalogEntry[]>;
  searchCatalog(input: ProductCatalogSearch): Promise<ProductCatalogEntry[]>;
}

export interface PaymentReceiptSummary extends Record<string, unknown> {
  method: string;
  reference: string;
  externalId?: string;
  status: 'success';
  timestamp: string;
}

export interface PaymentAttemptInput {
  productId: string;
  offeringId: string;
  endpointId: string;
  rail: ProductRail;
  providerPaymentId?: string;
  idempotencyKey: string;
  status: 'challenged' | 'settled' | 'failed' | 'refunded';
  amountMinor: number;
  currency: string;
  scale: number;
  requestFingerprint?: string | null;
  receipt?: Record<string, unknown>;
  failureCode?: string;
  agentExecutionProofId?: string;
}

export interface ProductEndpointRepository {
  findEnabledEndpoint(method: string, path: string): Promise<ProductEndpoint | null>;
}

export interface PaymentAttemptStore {
  record(input: PaymentAttemptInput): Promise<unknown>;
}

export interface MppPaymentSuccess {
  input?: Request;
  receipt: PaymentReceiptSummary;
}
export type AppHandler = (request: Request) => Promise<Response>;

export interface ProductCatalog {
  resolve(request: Request): Promise<ProductEndpoint | null>;
}

export interface ProductPaymentService {
  serve(endpoint: ProductEndpoint, request: Request): Promise<Response>;
}

// Agent identity domain types

export interface AgentIdentity {
  id: string;
  ownerId: string;
  displayName: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
}

export interface AgentSigningKey {
  id: string;
  agentIdentityId: string;
  algorithm: 'Ed25519';
  publicKeyJwk: JsonWebKey;
  publicKeyFingerprint: string;
  status: 'active' | 'retired' | 'revoked';
  notBefore: string;
  notAfter: string | null;
}

export interface Mandate {
  id: string;
  ownerId: string;
  agentIdentityId: string;
  version: number;
  status: 'active' | 'revoked' | 'expired';
  scope: MandateScope;
  maxAmountMinor: number;
  currency: string;
  expiresAt: string;
  createdAt: string;
}
export interface SellerPriceDisclosure {
  merchantIds: string[];
  maxPriceMinor: number;
  requirements?: string[];
}

export interface MandateScope {
  allowedProductSlugs?: string[];
  allowedPaths?: string[];
  guidelines?: string[];
  sellerPriceDisclosure?: SellerPriceDisclosure;
}

export interface SellerQuoteRequestRecord {
  id: string;
  merchantId: string;
  ownerId: string;
  agentIdentityId: string;
  mandateId: string;
  credentialCommitment: string;
  agentVerificationHash: string;
  priceLimitMinor: number;
  currency: string;
  requirements: string[];
  expiresAt: string;
  createdAt: string;
}

export interface MandateUsage {
  totalSpentMinor: number;
  purchaseCount: number;
}

export interface AgentExecutionProofRecord {
  id: string;
  agentIdentityId: string;
  agentSigningKeyId: string;
  mandateId: string;
  mandateVersion: number;
  requestMethod: string;
  requestPath: string;
  requestBodySha256: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string;
}

// Session token types

export interface PasskeySession {
  token: string;
  userId: string;
  credentialId: string;
  issuedAt: number;
  expiresAt: number;
}

// Conversation history types

export interface Conversation {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ConversationMessageInput {
  ownerId: string;
  conversationId: string;
  role: ConversationMessage['role'];
  content: string;
  createdAt: string;
}

export interface ConversationEvent {
  id: string;
  conversationId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationEventInput {
  ownerId: string;
  conversationId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// Payment history types

export interface PaymentAttemptRecord {
  id: string;
  productId: string;
  offeringId: string;
  endpointId: string;
  rail: ProductRail;
  providerPaymentId: string | null;
  idempotencyKey: string;
  status: 'challenged' | 'settled' | 'failed' | 'refunded';
  amountMinor: number;
  currency: string;
  scale: number;
  requestFingerprint: string | null;
  receipt: Record<string, unknown> | null;
  failureCode: string | null;
  agentExecutionProofId: string | null;
  createdAt: string;
}

export interface AgentActivityRecord {
  id: string;
  agentIdentityId: string;
  agentSigningKeyId: string;
  mandateId: string;
  mandateVersion: number;
  requestMethod: string;
  requestPath: string;
  nonce: string;
  issuedAt: string;
  verifiedAt: string;
  createdAt: string;
}


export interface MppHandlerOptions {
  amount: string;
  currency: string;
  resource: Record<string, unknown>;
  responseStatus?: number;
  onPaymentSuccess?: (payment: MppPaymentSuccess) => Promise<void>;
}

export type MppHandler = (request: Request) => Promise<Response>;
export type MppHandlerFactory = (options: MppHandlerOptions) => MppHandler;
