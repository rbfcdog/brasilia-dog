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
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
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


export interface MppHandlerOptions {
  amount: string;
  currency: string;
  resource: Record<string, unknown>;
  responseStatus?: number;
  onPaymentSuccess?: (payment: MppPaymentSuccess) => Promise<void>;
}

export type MppHandler = (request: Request) => Promise<Response>;
export type MppHandlerFactory = (options: MppHandlerOptions) => MppHandler;
