"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { PaymentChallengeError } from "@/lib/api";
import { getPasskeySessionToken } from "@/lib/passkey-session";
import { demoStorage } from "@/lib/demo-storage";
import { simulatedBiometricProvider } from "@/services/biometric-provider";
import { shoppingService } from "@/services/shopping-service";
import { backendService } from "@/services/backend-service";
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

/**
 * Persist a message to the backend conversation API when a passkey session exists.
 * Errors are swallowed so the chat flow is never blocked by persistence failures.
 */
async function persistMessage(
  conversationIdRef: React.RefObject<string | null>,
  message: ChatMessage,
): Promise<void> {
  const conversationId = conversationIdRef.current;
  if (!conversationId) return;

  try {
    await backendService.appendConversationMessage(conversationId, {
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    });
  } catch {
    // Persistence is best-effort. The chat continues working locally.
  }
}

export function useAIShopping() {
  const [state, dispatch] = useReducer(aiShoppingReducer, initialAIShoppingState);
  const {
    addScheduledPurchase: schedulePurchase,
    paymentMethods,
    preferredPaymentMethodId,
  } = useShoppingStore();
  const conversationIdRef = useRef<string | null>(null);

  // On mount: hydrate from backend if a passkey session exists, else from demoStorage.
  useEffect(() => {
    const sessionToken = getPasskeySessionToken();

    if (sessionToken) {
      // Try to load the most recent conversation from the backend.
      void backendService
        .listConversations()
        .then(async ({ conversations }) => {
          if (conversations.length > 0) {
            // Use the most recent conversation.
            const latest = conversations[0];
            conversationIdRef.current = latest.id;
            const { messages } = await backendService.conversationMessages(latest.id);
            dispatch({
              type: "HYDRATE",
              messages: messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt,
              })),
            });
          } else {
            // No existing conversation; create one.
            const { conversation } = await backendService.createConversation();
            conversationIdRef.current = conversation.id;
            dispatch({ type: "HYDRATE", messages: [] });
          }
        })
        .catch(() => {
          // Backend unavailable; fall back to demoStorage.
          dispatch({ type: "HYDRATE", messages: demoStorage.readMessages() });
        });
    } else {
      // No passkey session; use local demoStorage.
      dispatch({ type: "HYDRATE", messages: demoStorage.readMessages() });
    }
  }, []);

  // When using demoStorage (no backend conversation), keep it in sync.
  useEffect(() => {
    if (state.hydrated && !conversationIdRef.current) {
      demoStorage.writeMessages(state.messages);
    }
  }, [state.hydrated, state.messages]);

  const reset = useCallback(() => {
    if (!conversationIdRef.current) {
      demoStorage.clearMessages();
    }
    // On reset, clear the conversation ref so a new conversation is created next time.
    conversationIdRef.current = null;
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

      // Persist user message to backend if a conversation is active.
      void persistMessage(conversationIdRef, userMessage);

      try {
        const response = await shoppingService.analyze(trimmed, context);
        const assistantMessage = createMessage("assistant", response.message);

        if (response.kind === "clarification") {
          dispatch({ type: "CLARIFICATION", message: assistantMessage });
          void persistMessage(conversationIdRef, assistantMessage);
          return;
        }

        dispatch({
          type: "MANDATE_READY",
          message: assistantMessage,
          mandate: { ...response.mandate, paymentMethodId: preferredPaymentMethodId },
        });
        void persistMessage(conversationIdRef, assistantMessage);
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

      const searchingMessage = createMessage(
        "assistant",
        "Mandate approved. I am searching verified merchants for the best qualifying offer.",
      );
      dispatch({ type: "SEARCHING", message: searchingMessage });
      void persistMessage(conversationIdRef, searchingMessage);

      const paymentMethod = paymentMethods.find((method) => method.id === state.mandate?.paymentMethodId);
      if (!paymentMethod) throw new Error("Select a payment method before approving this mandate.");
      const result = await shoppingService.execute(state.mandate, paymentMethod);
      const assistantMessage = createMessage("assistant", result.message);

      if (result.kind === "purchased") {
        dispatch({ type: "PURCHASED", message: assistantMessage, receipt: result.receipt });
      } else {
        schedulePurchase(result.scheduledPurchase);
        dispatch({
          type: "SCHEDULED",
          message: assistantMessage,
          purchase: result.scheduledPurchase,
        });
      }
      void persistMessage(conversationIdRef, assistantMessage);
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
  }, [paymentMethods, schedulePurchase, state.mandate]);

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
