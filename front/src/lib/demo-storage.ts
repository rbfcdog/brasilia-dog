import type { PaymentMethod, ScheduledPurchase } from "@/types/shopping";

const SCHEDULED_KEY = "nomad:scheduled:v2";
const PAYMENT_METHODS_KEY = "nomad:payment-methods:v1";
const PAYMENT_PREFERENCE_KEY = "nomad:payment-preference:v1";
const REIMBURSEMENTS_KEY = "nomad:reimbursements:v1";

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "payment-visa-4242", brand: "Visa", label: "Personal Visa", last4: "4242", expiry: "08/29" },
  { id: "payment-mastercard-1881", brand: "Mastercard", label: "Work card", last4: "1881", expiry: "11/28" },
];

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeValue<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export const demoStorage = {
  readScheduled: () => readValue<ScheduledPurchase[]>(SCHEDULED_KEY, []),
  writeScheduled: (items: ScheduledPurchase[]) => writeValue(SCHEDULED_KEY, items),
  readPaymentMethods: () => readValue<PaymentMethod[]>(PAYMENT_METHODS_KEY, defaultPaymentMethods),
  writePaymentMethods: (methods: PaymentMethod[]) => writeValue(PAYMENT_METHODS_KEY, methods),
  readPreferredPaymentMethodId: () => readValue<string>(PAYMENT_PREFERENCE_KEY, defaultPaymentMethods[0].id),
  writePreferredPaymentMethodId: (id: string) => writeValue(PAYMENT_PREFERENCE_KEY, id),
  readReimbursements: () => readValue<Record<string, string>>(REIMBURSEMENTS_KEY, {}),
  writeReimbursements: (requests: Record<string, string>) => writeValue(REIMBURSEMENTS_KEY, requests),
};
