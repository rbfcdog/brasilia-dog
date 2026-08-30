"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { PaymentChallengeError } from "@/lib/api";
import { getPasskeySessionToken } from "@/lib/passkey-session";
import { demoStorage } from "@/lib/demo-storage";
import { passkeyBiometricProvider } from "@/services/biometric-provider";
import { shoppingService } from "@/services/shopping-service";
import { backendService, type ConversationEventInput } from "@/services/backend-service";
import type {
  ChatFlowState,
  ChatMessage,
  DiscoveredProduct,
  Mandate,
  MarketplaceListing,
  PaymentChallenge,
  PurchaseReceipt,
  ScheduledPurchase,
} from "@/types/shopping";
import { useShoppingStore } from "@/components/providers/shopping-provider";

export type ConversationStorage = "backend" | "local" | "unavailable";

export interface AIShoppingState {
  status: ChatFlowState;
  messages: ChatMessage[];
  mandate: Mandate | null;
  receipt: PurchaseReceipt | null;
  listings: MarketplaceListing[];
  discoveredProducts: DiscoveredProduct[];
  scheduledPurchase: ScheduledPurchase | null;
  paymentChallenge: PaymentChallenge | null;
  error: string | null;
  hydrated: boolean;
  storage: ConversationStorage;
  toast: string | null;
}

export type AIShoppingAction =
  | { type: "HYDRATE"; messages: ChatMessage[]; storage: ConversationStorage }
  | { type: "SUBMIT"; message: ChatMessage }
  | { type: "CLARIFICATION"; message: ChatMessage }
  | { type: "MANDATE_READY"; message: ChatMessage; mandate: Mandate }
  | { type: "PRODUCT_RESULTS"; message: ChatMessage; products: DiscoveredProduct[] }
  | { type: "UPDATE_MANDATE"; mandate: Mandate }
  | { type: "REQUEST_APPROVAL" }
  | { type: "CANCEL_APPROVAL" }
  | { type: "SEARCHING"; message: ChatMessage }
  | { type: "PURCHASED"; message: ChatMessage; receipt: PurchaseReceipt; listings: MarketplaceListing[] }
  | { type: "SCHEDULED"; message: ChatMessage; purchase: ScheduledPurchase; listings: MarketplaceListing[] }
  | { type: "PAYMENT_CHALLENGE"; challenge: PaymentChallenge }
  | { type: "ERROR"; message: string }
  | { type: "SET_STORAGE"; storage: ConversationStorage }
  | { type: "DISMISS_TOAST" }
  | { type: "RESET" };

export const initialAIShoppingState: AIShoppingState = {
  status: "idle",
  messages: [],
  mandate: null,
  listings: [],
  discoveredProducts: [],
  receipt: null,
  scheduledPurchase: null,
  paymentChallenge: null,
  error: null,
  hydrated: false,
  storage: "local",
  toast: null,
};

export function aiShoppingReducer(
  state: AIShoppingState,
  action: AIShoppingAction,
): AIShoppingState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...initialAIShoppingState,
        messages: action.messages,
        hydrated: true,
        storage: action.storage,
      };
    case "SUBMIT":
      return {
        ...state,
        status: "analyzing",
        messages: [...state.messages, action.message],
        mandate: null,
        receipt: null,
        listings: [],
        discoveredProducts: [],
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
    case "PRODUCT_RESULTS":
      return {
        ...state,
        status: "clarification",
        messages: [...state.messages, action.message],
        discoveredProducts: action.products,
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
        listings: action.listings,
        receipt: action.receipt,
        toast: "Purchase completed within your mandate.",
      };
    case "SCHEDULED":
      return {
        ...state,
        status: "scheduled",
        messages: [...state.messages, action.message],
        listings: action.listings,
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
    case "SET_STORAGE":
      return { ...state, storage: action.storage };
    case "DISMISS_TOAST":
      return { ...state, toast: null };
    case "RESET":
      return { ...initialAIShoppingState, hydrated: true, storage: state.storage };
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
class ConversationPersistenceError extends Error {
  constructor(cause: unknown) {
    super("This conversation could not be saved to the backend.");
    this.name = "ConversationPersistenceError";
    this.cause = cause;
  }
}

async function persistEvent(
  conversationIdRef: React.RefObject<string | null>,
  event: ConversationEventInput,
): Promise<boolean> {
  try {
    const conversationId = await ensureBackendConversation(conversationIdRef);
    if (!conversationId) return false;

    await backendService.appendConversationEvent(conversationId, event);
    return true;
  } catch (error) {
    throw new ConversationPersistenceError(error);
  }
}

async function synchronizePendingConversation(
  conversationIdRef: React.RefObject<string | null>,
  pendingMessages: React.MutableRefObject<ChatMessage[]>,
  pendingEvents: React.MutableRefObject<ConversationEventInput[]>,
): Promise<boolean> {
  try {
    const conversationId = await ensureBackendConversation(conversationIdRef);
    if (!conversationId) return false;

    while (pendingMessages.current.length > 0) {
      const message = pendingMessages.current[0];
      if (!message) break;
      await backendService.appendConversationMessage(conversationId, {
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      });
      pendingMessages.current.shift();
    }
    while (pendingEvents.current.length > 0) {
      const event = pendingEvents.current[0];
      if (!event) break;
      await backendService.appendConversationEvent(conversationId, event);
      pendingEvents.current.shift();
    }
    return true;
  } catch (error) {
    throw new ConversationPersistenceError(error);
  }
}


async function ensureBackendConversation(
  conversationIdRef: React.RefObject<string | null>,
): Promise<string | null> {
  if (conversationIdRef.current) return conversationIdRef.current;
  if (!getPasskeySessionToken()) return null;

  const { conversation } = await backendService.createConversation();
  conversationIdRef.current = conversation.id;
  return conversation.id;
}

async function persistMessage(
  conversationIdRef: React.RefObject<string | null>,
  message: ChatMessage,
): Promise<boolean> {
  try {
    const conversationId = await ensureBackendConversation(conversationIdRef);
    if (!conversationId) return false;

    await backendService.appendConversationMessage(conversationId, {
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    });
    return true;
  } catch (error) {
    throw new ConversationPersistenceError(error);
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
  const pendingMessagesRef = useRef<ChatMessage[]>([]);
  const pendingEventsRef = useRef<ConversationEventInput[]>([]);

  const loadConversation = useCallback(async (conversationId: string) => {
    const { messages } = await backendService.conversationMessages(conversationId);
    conversationIdRef.current = conversationId;
    dispatch({
      type: "HYDRATE",
      storage: "backend",
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    });
  }, []);

  // Hydrate the selected backend conversation, or the most recent one.
  useEffect(() => {
    const sessionToken = getPasskeySessionToken();
    if (!sessionToken) {
      dispatch({ type: "HYDRATE", messages: demoStorage.readMessages(), storage: "local" });
      return;
    }

    const selectedConversationId = new URLSearchParams(window.location.search).get("conversation");
    void backendService
      .listConversations()
      .then(async ({ conversations }) => {
        const selected = selectedConversationId
          ? conversations.find((conversation) => conversation.id === selectedConversationId)
          : conversations[0];
        if (selected) {
          await loadConversation(selected.id);
          return;
        }
        const { conversation } = await backendService.createConversation();
        conversationIdRef.current = conversation.id;
        dispatch({ type: "HYDRATE", messages: [], storage: "backend" });
      })
      .catch(() => dispatch({ type: "HYDRATE", messages: demoStorage.readMessages(), storage: "unavailable" }));
  }, [loadConversation]);

  useEffect(() => {
    function openConversation(event: Event) {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (!conversationId) return;
      void loadConversation(conversationId).catch(() => {
        dispatch({ type: "ERROR", message: "The selected conversation could not be loaded." });
      });
    }
    window.addEventListener("nomad:open-conversation", openConversation);
    return () => window.removeEventListener("nomad:open-conversation", openConversation);
  }, [loadConversation]);

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
      dispatch({ type: "SUBMIT", message: userMessage });

      try {
        const userPersisted = await persistMessage(conversationIdRef, userMessage);
        if (!userPersisted) {
          pendingMessagesRef.current.push(userMessage);
        }
        dispatch({ type: "SET_STORAGE", storage: userPersisted ? "backend" : "local" });
        const response = await shoppingService.analyze(trimmed, conversationIdRef.current ?? undefined);
        const assistantMessage = createMessage("assistant", response.message);

        if (!userPersisted) {
          pendingMessagesRef.current.push(assistantMessage);
          pendingEventsRef.current.push({
            type: "agent_response",
            payload: response,
            createdAt: assistantMessage.createdAt,
          });
        }

        if (response.kind === "clarification") {
          dispatch({ type: "CLARIFICATION", message: assistantMessage });
          return;
        }
        if (response.kind === "products") {
          dispatch({ type: "PRODUCT_RESULTS", message: assistantMessage, products: response.products });
          return;
        }

        dispatch({
          type: "MANDATE_READY",
          message: assistantMessage,
          mandate: { ...response.mandate, paymentMethodId: preferredPaymentMethodId },
        });
      } catch (error) {
        if (error instanceof ConversationPersistenceError) {
          dispatch({ type: "SET_STORAGE", storage: "unavailable" });
        }
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
    [preferredPaymentMethodId, state.status],
  );

  const requestApproval = useCallback(() => {
    if (state.mandate) dispatch({ type: "REQUEST_APPROVAL" });
  }, [state.mandate]);

  const confirmApproval = useCallback(async () => {
    if (!state.mandate) return;

    try {
      const approval = await passkeyBiometricProvider.approve(state.mandate);
      if (!approval.approved) {
        throw new Error("Native passkey verification is required before this mandate can be executed.");
      }

      const synchronized = await synchronizePendingConversation(
        conversationIdRef,
        pendingMessagesRef,
        pendingEventsRef,
      );
      if (!synchronized) {
        throw new ConversationPersistenceError(new Error("Passkey session was not established."));
      }
      dispatch({ type: "SET_STORAGE", storage: "backend" });

      const approvalSaved = await persistEvent(conversationIdRef, {
        type: "passkey_approved",
        payload: {
          mandateId: state.mandate.id,
          method: approval.method,
          approvedAt: approval.approvedAt,
        },
        createdAt: approval.approvedAt,
      });
      if (!approvalSaved) {
        throw new ConversationPersistenceError(new Error("Passkey approval could not be saved."));
      }

      const paymentMethod = paymentMethods.find((method) => method.id === state.mandate?.paymentMethodId);
      if (!paymentMethod) throw new Error("Select a payment method before approving this mandate.");

      const searchingMessage = createMessage(
        "assistant",
        "Search mandate approved. I am now comparing verified merchants and will automatically buy the best qualifying offer.",
      );
      const searchingSaved = await persistMessage(conversationIdRef, searchingMessage);
      if (!searchingSaved) {
        throw new ConversationPersistenceError(new Error("Mandate activation could not be saved."));
      }
      const activationSaved = await persistEvent(conversationIdRef, {
        type: "mandate_activated",
        payload: { mandateId: state.mandate.id, scope: state.mandate.scope },
        createdAt: searchingMessage.createdAt,
      });
      if (!activationSaved) {
        throw new ConversationPersistenceError(new Error("Mandate activation could not be saved."));
      }
      dispatch({ type: "SEARCHING", message: searchingMessage });

      const result = await shoppingService.execute(state.mandate, paymentMethod);
      const assistantMessage = createMessage("assistant", result.message);
      const resultSaved = await persistMessage(conversationIdRef, assistantMessage);
      if (!resultSaved) {
        throw new ConversationPersistenceError(new Error("Purchase result could not be saved."));
      }
      const resultEventSaved = await persistEvent(conversationIdRef, {
        type: result.kind === "purchased" ? "payment_executed" : "mandate_activated",
        payload: result,
        createdAt: assistantMessage.createdAt,
      });
      if (!resultEventSaved) {
        throw new ConversationPersistenceError(new Error("Purchase result could not be saved."));
      }

      if (result.kind === "purchased") {
        dispatch({
          type: "PURCHASED",
          message: assistantMessage,
          receipt: result.receipt,
          listings: result.listings,
        });
      } else {
        schedulePurchase(result.scheduledPurchase);
        dispatch({
          type: "SCHEDULED",
          message: assistantMessage,
          purchase: result.scheduledPurchase,
          listings: result.listings,
        });
      }
    } catch (error) {
      if (error instanceof ConversationPersistenceError) {
        dispatch({ type: "SET_STORAGE", storage: "unavailable" });
      }
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
