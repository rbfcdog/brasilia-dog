"use client";

import { useCallback, useEffect, useReducer } from "react";
import { PaymentChallengeError } from "@/lib/api";
import { demoStorage } from "@/lib/demo-storage";
import { simulatedBiometricProvider } from "@/services/biometric-provider";
import { shoppingService } from "@/services/shopping-service";
import type {
  ChatFlowState,
  ChatMessage,
  Mandate,
  PaymentChallenge,
  PurchaseReceipt,
  ScheduledPurchase,
} from "@/types/shopping";
import { useShoppingStore } from "@/components/providers/shopping-provider";

export interface AIShoppingState {
  status: ChatFlowState;
  messages: ChatMessage[];
  mandate: Mandate | null;
  receipt: PurchaseReceipt | null;
  scheduledPurchase: ScheduledPurchase | null;
  paymentChallenge: PaymentChallenge | null;
  error: string | null;
  hydrated: boolean;
  toast: string | null;
}

export type AIShoppingAction =
  | { type: "HYDRATE"; messages: ChatMessage[] }
  | { type: "SUBMIT"; message: ChatMessage }
  | { type: "CLARIFICATION"; message: ChatMessage }
  | { type: "MANDATE_READY"; message: ChatMessage; mandate: Mandate }
  | { type: "UPDATE_MANDATE"; mandate: Mandate }
  | { type: "REQUEST_APPROVAL" }
  | { type: "CANCEL_APPROVAL" }
  | { type: "SEARCHING"; message: ChatMessage }
  | { type: "PURCHASED"; message: ChatMessage; receipt: PurchaseReceipt }
  | { type: "SCHEDULED"; message: ChatMessage; purchase: ScheduledPurchase }
  | { type: "PAYMENT_CHALLENGE"; challenge: PaymentChallenge }
  | { type: "ERROR"; message: string }
  | { type: "DISMISS_TOAST" }
  | { type: "RESET" };

export const initialAIShoppingState: AIShoppingState = {
  status: "idle",
  messages: [],
  mandate: null,
  receipt: null,
  scheduledPurchase: null,
  paymentChallenge: null,
  error: null,
  hydrated: false,
  toast: null,
};

export function aiShoppingReducer(
  state: AIShoppingState,
  action: AIShoppingAction,
): AIShoppingState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, messages: action.messages, hydrated: true };
    case "SUBMIT":
      return {
        ...state,
        status: "analyzing",
        messages: [...state.messages, action.message],
        mandate: null,
        receipt: null,
        scheduledPurchase: null,
        paymentChallenge: null,
        error: null,
        toast: null,
      };
    case "CLARIFICATION":
      return {
        ...state,
        status: "clarification",
        messages: [...state.messages, action.message],
      };
    case "MANDATE_READY":
      return {
        ...state,
        status: "mandate_ready",
        messages: [...state.messages, action.message],
        mandate: action.mandate,
      };
    case "UPDATE_MANDATE":
      return state.status === "mandate_ready" ? { ...state, mandate: action.mandate } : state;
    case "REQUEST_APPROVAL":
      return { ...state, status: "biometric_confirmation" };
    case "CANCEL_APPROVAL":
      return { ...state, status: "mandate_ready" };
    case "SEARCHING":
      return {
        ...state,
        status: "searching",
        mandate: state.mandate ? { ...state.mandate, status: "active" } : null,
        messages: [...state.messages, action.message],
      };
    case "PURCHASED":
      return {
        ...state,
        status: "purchased",
        messages: [...state.messages, action.message],
        receipt: action.receipt,
        toast: "Purchase completed within your mandate.",
      };
    case "SCHEDULED":
      return {
        ...state,
        status: "scheduled",
        messages: [...state.messages, action.message],
        scheduledPurchase: action.purchase,
        toast: "Mandate activated. Monitoring has started.",
      };
    case "PAYMENT_CHALLENGE":
      return {
        ...state,
        status: "payment_challenge",
        paymentChallenge: action.challenge,
        error: null,
      };
    case "ERROR":
      return { ...state, status: "error", error: action.message };
    case "DISMISS_TOAST":
      return { ...state, toast: null };
    case "RESET":
      return { ...initialAIShoppingState, hydrated: true };
  }
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function useAIShopping() {
  const [state, dispatch] = useReducer(aiShoppingReducer, initialAIShoppingState);
  const { addScheduledPurchase, paymentMethods, preferredPaymentMethodId } = useShoppingStore();

  useEffect(() => {
    dispatch({ type: "HYDRATE", messages: demoStorage.readMessages() });
  }, []);

  useEffect(() => {
    if (state.hydrated) demoStorage.writeMessages(state.messages);
  }, [state.hydrated, state.messages]);

  const reset = useCallback(() => {
    demoStorage.clearMessages();
    dispatch({ type: "RESET" });
  }, []);

  useEffect(() => {
    window.addEventListener("nomad:new-request", reset);
    return () => window.removeEventListener("nomad:new-request", reset);
  }, [reset]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || state.status === "analyzing" || state.status === "searching") return;

      const userMessage = createMessage("user", trimmed);
      const context = state.messages;
      dispatch({ type: "SUBMIT", message: userMessage });

      try {
        const response = await shoppingService.analyze(trimmed, context);
        const assistantMessage = createMessage("assistant", response.message);

        if (response.kind === "clarification") {
          dispatch({ type: "CLARIFICATION", message: assistantMessage });
          return;
        }

        dispatch({
          type: "MANDATE_READY",
          message: assistantMessage,
          mandate: { ...response.mandate, paymentMethodId: preferredPaymentMethodId },
        });
      } catch (error) {
        if (error instanceof PaymentChallengeError) {
          dispatch({ type: "PAYMENT_CHALLENGE", challenge: error.challenge });
          return;
        }
        dispatch({
          type: "ERROR",
          message: error instanceof Error ? error.message : "The request could not be analyzed.",
        });
      }
    },
    [preferredPaymentMethodId, state.messages, state.status],
  );

  const requestApproval = useCallback(() => {
    if (state.mandate) dispatch({ type: "REQUEST_APPROVAL" });
  }, [state.mandate]);

  const confirmApproval = useCallback(async () => {
    if (!state.mandate) return;

    try {
      const approval = await simulatedBiometricProvider.approve(state.mandate);
      if (!approval.approved) throw new Error("Identity confirmation was declined.");

      dispatch({
        type: "SEARCHING",
        message: createMessage(
          "assistant",
          "Mandate approved. I am searching verified merchants for the best qualifying offer.",
        ),
      });

      const paymentMethod = paymentMethods.find((method) => method.id === state.mandate?.paymentMethodId);
      if (!paymentMethod) throw new Error("Select a payment method before approving this mandate.");
      const result = await shoppingService.execute(state.mandate, paymentMethod);
      const assistantMessage = createMessage("assistant", result.message);

      if (result.kind === "purchased") {
        dispatch({ type: "PURCHASED", message: assistantMessage, receipt: result.receipt });
      } else {
        addScheduledPurchase(result.scheduledPurchase);
        dispatch({
          type: "SCHEDULED",
          message: assistantMessage,
          purchase: result.scheduledPurchase,
        });
      }
    } catch (error) {
      if (error instanceof PaymentChallengeError) {
        dispatch({ type: "PAYMENT_CHALLENGE", challenge: error.challenge });
        return;
      }
      dispatch({
        type: "ERROR",
        message: error instanceof Error ? error.message : "Approval could not be completed.",
      });
    }
  }, [addScheduledPurchase, paymentMethods, state.mandate]);

  return {
    state,
    sendMessage,
    requestApproval,
    updateMandate: (mandate: Mandate) => dispatch({ type: "UPDATE_MANDATE", mandate }),
    cancelApproval: () => dispatch({ type: "CANCEL_APPROVAL" }),
    confirmApproval,
    reset,
    dismissToast: () => dispatch({ type: "DISMISS_TOAST" }),
  };
}
