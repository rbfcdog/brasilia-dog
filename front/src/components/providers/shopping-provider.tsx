"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultPaymentMethods, demoStorage } from "@/lib/demo-storage";
import type { PaymentMethod, ScheduledPurchase } from "@/types/shopping";

interface ShoppingContextValue {
  scheduledPurchases: ScheduledPurchase[];
  addScheduledPurchase: (purchase: ScheduledPurchase) => void;
  revokeScheduledPurchase: (purchaseId: string) => void;
  paymentMethods: PaymentMethod[];
  preferredPaymentMethodId: string;
  addPaymentMethod: (method: Omit<PaymentMethod, "id">) => void;
  removePaymentMethod: (methodId: string) => void;
  setPreferredPaymentMethodId: (methodId: string) => void;
  hydrated: boolean;
}

const ShoppingContext = createContext<ShoppingContextValue | null>(null);

export function ShoppingProvider({ children }: { children: React.ReactNode }) {
  const [scheduledPurchases, setScheduledPurchases] = useState<ScheduledPurchase[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [preferredPaymentMethodId, setPreferredPaymentMethodId] = useState(defaultPaymentMethods[0].id);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScheduledPurchases(demoStorage.readScheduled());
      const storedMethods = demoStorage.readPaymentMethods();
      const storedPreference = demoStorage.readPreferredPaymentMethodId();
      setPaymentMethods(storedMethods);
      setPreferredPaymentMethodId(
        storedMethods.some((method) => method.id === storedPreference)
          ? storedPreference
          : storedMethods[0]?.id ?? "",
      );
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated) demoStorage.writeScheduled(scheduledPurchases);
  }, [hydrated, scheduledPurchases]);

  useEffect(() => {
    if (!hydrated) return;
    demoStorage.writePaymentMethods(paymentMethods);
    demoStorage.writePreferredPaymentMethodId(preferredPaymentMethodId);
  }, [hydrated, paymentMethods, preferredPaymentMethodId]);

  const addScheduledPurchase = useCallback((purchase: ScheduledPurchase) => {
    setScheduledPurchases((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== purchase.id);
      return [purchase, ...withoutDuplicate];
    });
  }, []);

  const revokeScheduledPurchase = useCallback((purchaseId: string) => {
    setScheduledPurchases((current) => current.map((purchase) =>
      purchase.id === purchaseId && purchase.status === "searching"
        ? { ...purchase, status: "revoked", revokedAt: new Date().toISOString() }
        : purchase,
    ));
  }, []);

  const addPaymentMethod = useCallback((method: Omit<PaymentMethod, "id">) => {
    const paymentMethod = { ...method, id: crypto.randomUUID() };
    setPaymentMethods((current) => [...current, paymentMethod]);
    setPreferredPaymentMethodId((current) => current || paymentMethod.id);
  }, []);

  const removePaymentMethod = useCallback((methodId: string) => {
    setPaymentMethods((current) => current.filter((method) => method.id !== methodId));
    setPreferredPaymentMethodId((preferred) => preferred === methodId
      ? paymentMethods.find((method) => method.id !== methodId)?.id ?? ""
      : preferred,
    );
  }, [paymentMethods]);

  const value = useMemo(
    () => ({
      scheduledPurchases,
      addScheduledPurchase,
      revokeScheduledPurchase,
      paymentMethods,
      preferredPaymentMethodId,
      addPaymentMethod,
      removePaymentMethod,
      setPreferredPaymentMethodId,
      hydrated,
    }),
    [scheduledPurchases, addScheduledPurchase, revokeScheduledPurchase, paymentMethods, preferredPaymentMethodId, addPaymentMethod, removePaymentMethod, hydrated],
  );

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}

export function useShoppingStore() {
  const context = useContext(ShoppingContext);
  if (!context) throw new Error("useShoppingStore must be used within ShoppingProvider.");
  return context;
}
