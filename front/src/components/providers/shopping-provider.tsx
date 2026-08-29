"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { demoStorage } from "@/lib/demo-storage";
import type { ScheduledPurchase } from "@/types/shopping";

interface ShoppingContextValue {
  scheduledPurchases: ScheduledPurchase[];
  addScheduledPurchase: (purchase: ScheduledPurchase) => void;
  hydrated: boolean;
}

const ShoppingContext = createContext<ShoppingContextValue | null>(null);

export function ShoppingProvider({ children }: { children: React.ReactNode }) {
  const [scheduledPurchases, setScheduledPurchases] = useState<ScheduledPurchase[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScheduledPurchases(demoStorage.readScheduled());
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated) demoStorage.writeScheduled(scheduledPurchases);
  }, [hydrated, scheduledPurchases]);

  const addScheduledPurchase = useCallback((purchase: ScheduledPurchase) => {
    setScheduledPurchases((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== purchase.id);
      return [purchase, ...withoutDuplicate];
    });
  }, []);

  const value = useMemo(
    () => ({ scheduledPurchases, addScheduledPurchase, hydrated }),
    [scheduledPurchases, addScheduledPurchase, hydrated],
  );

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}

export function useShoppingStore() {
  const context = useContext(ShoppingContext);
  if (!context) throw new Error("useShoppingStore must be used within ShoppingProvider.");
  return context;
}
