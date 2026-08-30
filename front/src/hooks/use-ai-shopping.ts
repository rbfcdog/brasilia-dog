"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { passkeyBiometricProvider } from "@/services/biometric-provider";
import { shoppingService } from "@/services/shopping-service";
import { backendService } from "@/services/backend-service";
import type { BiometricApprovalMode, ChatFlowState, ChatMessage, DiscoveredProduct, Mandate, PublicAgentRun } from "@/types/shopping";

export type ConversationStorage = "backend" | "unavailable";

export interface AIShoppingState {
  status: ChatFlowState;
  messages: ChatMessage[];
  mandate: Mandate | null;
  run: PublicAgentRun | null;
  discoveredProducts: DiscoveredProduct[];
  error: string | null;
  hydrated: boolean;
  storage: ConversationStorage;
  toast: string | null;
  approvalIntent: "approve" | "resume" | null;
}

export type AIShoppingAction =
  | { type: "HYDRATE"; messages: ChatMessage[]; storage: ConversationStorage }
  | { type: "SUBMIT"; message: ChatMessage }
  | { type: "CLARIFICATION"; message: ChatMessage }
  | { type: "MANDATE_READY"; message: ChatMessage; mandate: Mandate }
  | { type: "PRODUCT_RESULTS"; message: ChatMessage; products: DiscoveredProduct[] }
  | { type: "UPDATE_MANDATE"; mandate: Mandate }
  | { type: "REQUEST_APPROVAL"; intent: "approve" | "resume" }
  | { type: "CANCEL_APPROVAL" }
  | { type: "SEARCHING"; message: ChatMessage }
  | { type: "RUN_UPDATED"; run: PublicAgentRun }
  | { type: "ERROR"; message: string }
  | { type: "SET_STORAGE"; storage: ConversationStorage }
  | { type: "DISMISS_TOAST" }
  | { type: "RESET" };
export const initialAIShoppingState: AIShoppingState = {
  status: "idle", messages: [], mandate: null, run: null, discoveredProducts: [], error: null,
  hydrated: false, storage: "unavailable", toast: null, approvalIntent: null,
};

function resultMessage(run: PublicAgentRun): string {
  const message = run.result?.message;
  return typeof message === "string" ? message : `Agent run finished with status ${run.status}.`;
}

export function aiShoppingReducer(state: AIShoppingState, action: AIShoppingAction): AIShoppingState {
  switch (action.type) {
    case "HYDRATE": return { ...initialAIShoppingState, messages: action.messages, hydrated: true, storage: action.storage };
    case "SUBMIT": return { ...state, status: "analyzing", messages: [...state.messages, action.message], mandate: null, run: null, error: null, toast: null };
    case "CLARIFICATION": return { ...state, status: "clarification", messages: [...state.messages, action.message] };
    case "PRODUCT_RESULTS": return { ...state, status: "clarification", messages: [...state.messages, action.message], discoveredProducts: action.products };
    case "MANDATE_READY": return { ...state, status: "mandate_ready", messages: [...state.messages, action.message], mandate: action.mandate };
    case "UPDATE_MANDATE": return state.status === "mandate_ready" ? { ...state, mandate: action.mandate } : state;
    case "REQUEST_APPROVAL": return { ...state, status: "biometric_confirmation", approvalIntent: action.intent };
    case "CANCEL_APPROVAL": return { ...state, status: state.run?.status === "waiting_for_extension" ? "waiting_for_extension" : "mandate_ready" };
    case "SEARCHING": return { ...state, status: "searching", messages: [...state.messages, action.message] };
    case "RUN_UPDATED": {
      const status = action.run.status === "completed" ? "purchased"
        : action.run.status === "waiting_for_extension" ? "waiting_for_extension"
          : action.run.status === "rejected" || action.run.status === "failed" ? "error" : "searching";
      return { ...state, run: action.run, status, error: status === "error" ? resultMessage(action.run) : null,
        toast: action.run.status === "completed" ? "Purchase settled by Stripe within the mandate." : null };
    }
    case "ERROR": return { ...state, status: "error", error: action.message };
    case "SET_STORAGE": return { ...state, storage: action.storage };
    case "DISMISS_TOAST": return { ...state, toast: null };
    case "RESET": return { ...initialAIShoppingState, hydrated: true, storage: state.storage };
  }
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
}

async function ensureBackendConversation(ref: React.RefObject<string | null>): Promise<string> {
  if (ref.current) return ref.current;
  const { conversation } = await backendService.createConversation();
  ref.current = conversation.id;
  return conversation.id;
}

async function persistMessage(ref: React.RefObject<string | null>, message: ChatMessage): Promise<void> {
  const id = await ensureBackendConversation(ref);
  await backendService.appendConversationMessage(id, { role: message.role, content: message.content, createdAt: message.createdAt });
}

export function useAIShopping() {
  const [state, dispatch] = useReducer(aiShoppingReducer, initialAIShoppingState);
  const conversationIdRef = useRef<string | null>(null);
  const pollingGeneration = useRef(0);
  const messageInFlight = useRef(false);


  const loadConversation = useCallback(async (id: string) => {
    const { messages } = await backendService.conversationMessages(id);
    conversationIdRef.current = id;
    dispatch({ type: "HYDRATE", storage: "backend", messages: messages.map((message) => ({
      id: message.id, role: message.role, content: message.content, createdAt: message.createdAt,
    })) });
  }, []);

// Conversation transcripts are server-owned. Never hydrate browser storage.
  useEffect(() => {
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
        dispatch({ type: "HYDRATE", messages: [], storage: "backend" });
      })
      .catch(() => dispatch({ type: "HYDRATE", messages: [], storage: "unavailable" }));
  }, [loadConversation]);

  useEffect(() => {
    function openConversation(event: Event) {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (!conversationId) return;
      void loadConversation(conversationId).catch(() => {
        dispatch({ type: "ERROR", message: "The selected conversation could not be loaded." });
      });
    }
    window.addEventListener("vero:open-conversation", openConversation);
    return () => window.removeEventListener("vero:open-conversation", openConversation);
  }, [loadConversation]);

  // One-time migration cleanup for transcripts saved by prior browser builds.
  useEffect(() => {
    window.localStorage.removeItem("vero:chat:v1");
  }, []);

  useEffect(() => {
    const selectedId = new URLSearchParams(window.location.search).get("conversation");
    void backendService.listConversations().then(async ({ conversations }) => {
      const selected = selectedId ? conversations.find((item) => item.id === selectedId) : conversations[0];
      if (selected) await loadConversation(selected.id);
      else dispatch({ type: "HYDRATE", messages: [], storage: "backend" });
    }).catch(() => dispatch({ type: "HYDRATE", messages: [], storage: "unavailable" }));
  }, [loadConversation]);

  const poll = useCallback(async (runId: string) => {
    const generation = ++pollingGeneration.current;
    while (generation === pollingGeneration.current) {
      const run = await shoppingService.getRun(runId);
      dispatch({ type: "RUN_UPDATED", run });
      if (["completed", "rejected", "failed", "waiting_for_extension"].includes(run.status)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
  }, []);

  const reset = useCallback(() => {
    pollingGeneration.current += 1;
    conversationIdRef.current = null;
    dispatch({ type: "RESET" });
  }, []);
  useEffect(() => {
    window.addEventListener("vero:new-request", reset);
    return () => window.removeEventListener("vero:new-request", reset);
  }, [reset]);
  useEffect(() => {
    const open = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (conversationId) void loadConversation(conversationId).catch(() => dispatch({ type: "SET_STORAGE", storage: "unavailable" }));
    };
    window.addEventListener("nomad:open-conversation", open);
    return () => window.removeEventListener("nomad:open-conversation", open);
  }, [loadConversation]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || messageInFlight.current || state.status === "analyzing" || state.status === "searching") return;

    messageInFlight.current = true;
    const userMessage = createMessage("user", trimmed);
    dispatch({ type: "SUBMIT", message: userMessage });
    try {
      const response = await shoppingService.analyze(trimmed, conversationIdRef.current ?? undefined);
      conversationIdRef.current = response.conversationId;
      dispatch({ type: "SET_STORAGE", storage: "backend" });
      const assistant = createMessage("assistant", response.message);
      if (response.kind === "clarification") dispatch({ type: "CLARIFICATION", message: assistant });
      else if (response.kind === "products") dispatch({ type: "PRODUCT_RESULTS", message: assistant, products: response.products });
      else dispatch({ type: "MANDATE_READY", message: assistant, mandate: response.mandate });
    } catch (error) {
      dispatch({ type: "ERROR", message: error instanceof Error ? error.message : "The request could not be analyzed." });
    } finally {
      messageInFlight.current = false;
    }
  }, [state.status]);

  const requestApproval = useCallback(() => {
    if (state.mandate) dispatch({ type: "REQUEST_APPROVAL", intent: "approve" });
  }, [state.mandate]);

  const requestResume = useCallback(() => {
    if (state.run?.status === "waiting_for_extension" && state.mandate) {
      dispatch({ type: "REQUEST_APPROVAL", intent: "resume" });
    }
  }, [state.mandate, state.run]);

  const confirmApproval = useCallback(async (mode: BiometricApprovalMode = "passkey") => {
    if (!state.mandate) return;
    if (state.approvalIntent === "resume") {
      if (!state.run || state.run.status !== "waiting_for_extension") return;
      try {
        const approval = await passkeyBiometricProvider.approve(state.mandate, mode);
        if (!approval.approved) throw new Error("Fresh passkey verification is required to extend the mandate.");
        await shoppingService.resumeRun(state.run.runId);
        await poll(state.run.runId);
      } catch (error) {
        dispatch({ type: "ERROR", message: error instanceof Error ? error.message : "The mandate could not be extended." });
      }
      return;
    }
    try {
      const approval = await passkeyBiometricProvider.approve(state.mandate, mode);
      if (!approval.approved) throw new Error("Fresh passkey verification is required.");
      const message = createMessage("assistant", "Mandate approved. The durable agent run is monitoring the authoritative marketplace.");
      try {
        await persistMessage(conversationIdRef, message);
      } catch (error) {
        console.error("Conversation approval message persistence failed.", error);
        dispatch({ type: "SET_STORAGE", storage: "unavailable" });
      }
      dispatch({ type: "SEARCHING", message });
      const goal = [...state.messages].reverse().find((item) => item.role === "user")?.content ?? state.mandate.scope;
      const started = await shoppingService.startRun(goal, state.mandate, conversationIdRef.current ?? undefined);
      await poll(started.runId);
    } catch (error) {
      dispatch({ type: "ERROR", message: error instanceof Error ? error.message : "Approval could not be completed." });
    }
  }, [poll, state.approvalIntent, state.mandate, state.messages, state.run]);

  return {
    state, sendMessage, requestApproval,
    updateMandate: (mandate: Mandate) => dispatch({ type: "UPDATE_MANDATE", mandate }),
    cancelApproval: () => dispatch({ type: "CANCEL_APPROVAL" }),
    confirmApproval, requestResume, reset,
    dismissToast: () => dispatch({ type: "DISMISS_TOAST" }),
  };
}
