export type ChatRole = "user" | "assistant";

export type ChatFlowState =
  | "idle"
  | "analyzing"
  | "clarification"
  | "mandate_ready"
  | "biometric_confirmation"
  | "searching"
  | "waiting_for_extension"
  | "purchased"
  | "scheduled"
  | "payment_challenge"
  | "error";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface Mandate {
  id: string;
  scope: string;
  maximumAmount: number;
  currency: "USD";
  minimumScreenSize?: number;
  validUntil: string;
  status: "pending" | "active";
  marketplaceScope?: MarketplaceScope;
}

export interface MarketplaceScope {
  query: string;
  category: string;
  constraints: Array<{
    field: string;
    operator: "eq" | "gte" | "lte";
    value: string | number | boolean;
  }>;
  searchWindowSeconds: 60;
}

export interface AgentRunProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  merchant: { id: string; businessName: string; status: "active" };
  offering: { id: string; amountMinor: number; currency: "usd"; scale: number; active: true };
}

export interface PublicAgentRun {
  runId: string;
  ownerId: string;
  status: "queued" | "running" | "monitoring" | "waiting_for_extension" | "completed" | "rejected" | "failed";
  goal: string;
  mandateId: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  nextPollAt?: string;
  events: Array<{ sequence: number; type: string; occurredAt: string; data: Record<string, unknown> }>;
  mandate?: {
    id: string;
    version: number;
    status: "active" | "revoked" | "expired";
    scope: MarketplaceScope;
    maxAmountMinor: number;
    currency: "usd";
    expiresAt: string;
  };
  candidates: AgentRunProduct[];
  selectedProduct?: AgentRunProduct;
  authorityChecks: Array<{ name: string; passed: boolean; checkedAt: string }>;
  extensionRequest?: { mandateId: string; expiredAt: string; requestedAt: string };
  extensionId?: string;
  proofId?: string;
  paymentAttempt?: {
    id?: string;
    status?: string;
    amountMinor?: number;
    currency?: string;
    scale?: number;
    providerPaymentId?: string | null;
    agentExecutionProofId?: string | null;
    receipt?: Record<string, unknown> | null;
  };
  receipt?: { method?: string; reference?: string; externalId?: string; status?: string; timestamp?: string };
  result?: Record<string, unknown>;
}

export interface DiscoveredProduct {
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: "USD";
}

export type AgentActivity =
  | {
      type: "catalog_search";
      category: string | null;
      query: string | null;
      maximumAmount: number | null;
      resultSlugs: string[];
    }
  | {
      type: "category_list";
      categories: string[];
    }
  | {
      type: "product_comparison";
      requestedSlugs: string[];
      resultSlugs: string[];
    };

export type AgentResponse =
  | {
      kind: "clarification";
      message: string;
      activity?: AgentActivity[];
    }
  | {
      kind: "products";
      message: string;
      products: DiscoveredProduct[];
      activity?: AgentActivity[];
    }
  | {
      kind: "mandate";
      message: string;
      mandate: Mandate;
      activity?: AgentActivity[];
    };

export interface PaymentChallenge {
  scheme: "Payment";
  status: 402;
  headerPresent: boolean;
  message: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type BiometricApprovalMode = "passkey" | "demo";

export interface BiometricApprovalResult {
  approved: boolean;
  method: BiometricApprovalMode;
  approvedAt: string;
}

export interface BiometricApprovalProvider {
  approve(mandate: Mandate, mode?: BiometricApprovalMode): Promise<BiometricApprovalResult>;
}
