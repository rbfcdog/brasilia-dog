export type ChatRole = "user" | "assistant";

export type ChatFlowState =
  | "idle"
  | "analyzing"
  | "clarification"
  | "mandate_ready"
  | "biometric_confirmation"
  | "searching"
  | "purchased"
  | "scheduled"
  | "payment_challenge"
  | "error";

export type MockPurchaseOutcome = "immediate" | "scheduled";

export type PaymentBrand = "Visa" | "Mastercard" | "Amex";

export interface PaymentMethod {
  id: string;
  brand: PaymentBrand;
  label: string;
  last4: string;
  expiry: string;
}

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
  validityHours: number;
  paymentMethodId: string;
  status: "pending" | "active";
  mockOutcome: MockPurchaseOutcome;
}

export interface PurchaseReceipt {
  id: string;
  mandateId: string;
  merchant: string;
  item: string;
  subtotal: number;
  taxes: number;
  total: number;
  currency: "USD";
  purchasedAt: string;
  paymentMethod: Pick<PaymentMethod, "brand" | "label" | "last4">;
  status: "approved";
}

export interface ScheduledPurchase {
  id: string;
  mandateId: string;
  scope: string;
  maximumAmount: number;
  currency: "USD";
  createdAt: string;
  validUntil: string;
  validityHours: number;
  paymentMethod: Pick<PaymentMethod, "brand" | "label" | "last4">;
  status: "searching" | "revoked";
  revokedAt?: string;
}

export type AgentResponse =
  | {
      kind: "clarification";
      message: string;
    }
  | {
      kind: "mandate";
      message: string;
      mandate: Mandate;
    };

export type PurchaseResponse =
  | {
      kind: "purchased";
      message: string;
      receipt: PurchaseReceipt;
    }
  | {
      kind: "scheduled";
      message: string;
      scheduledPurchase: ScheduledPurchase;
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

export interface BiometricApprovalResult {
  approved: boolean;
  method: "simulated";
  approvedAt: string;
}

export interface BiometricApprovalProvider {
  approve(mandate: Mandate): Promise<BiometricApprovalResult>;
}
