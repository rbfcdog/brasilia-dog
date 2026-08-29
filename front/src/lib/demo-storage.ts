import type { ChatMessage, ScheduledPurchase } from "@/types/shopping";

const CHAT_KEY = "nomad:chat:v1";
const SCHEDULED_KEY = "nomad:scheduled:v1";

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
  readMessages: () => readValue<ChatMessage[]>(CHAT_KEY, []),
  writeMessages: (messages: ChatMessage[]) => writeValue(CHAT_KEY, messages),
  clearMessages: () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(CHAT_KEY);
  },
  readScheduled: () => readValue<ScheduledPurchase[]>(SCHEDULED_KEY, []),
  writeScheduled: (items: ScheduledPurchase[]) => writeValue(SCHEDULED_KEY, items),
};
