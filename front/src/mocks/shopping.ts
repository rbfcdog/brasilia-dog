import type {
  AgentResponse,
  ChatMessage,
  Mandate,
  MarketplaceListing,
  MockPurchaseOutcome,
  PaymentMethod,
  PurchaseResponse,
} from "@/types/shopping";

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseBudget(message: string) {
  const match = message.match(/(?:up to|under|maximum|max|budget(?: of)?)\s*\$?\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function hasMonitorDetails(message: string) {
  return /ultrawide|\b(?:3[4-9]|4\d)\s*(?:inch|inches|\")|at least\s+\d+/i.test(message);
}

function makeMandate(message: string, context: ChatMessage[]): Mandate {
  const joinedContext = [...context.map((item) => item.content), message].join(" ");
  const budget = parseBudget(message) ?? parseBudget(joinedContext) ?? 300;
  const screenSizeMatch = joinedContext.match(/(?:at least\s*)?(\d{2})\s*(?:inch|inches|\")/i);
  const scope = /monitor/i.test(joinedContext)
    ? `${screenSizeMatch?.[1] ?? "34"}-inch ultrawide monitor`
    : message.trim().replace(/[.!?]+$/, "");
  const mockOutcome: MockPurchaseOutcome =
    budget <= 220 || /keep monitoring|track|schedule/i.test(message)
      ? "scheduled"
      : "immediate";

  return {
    id: crypto.randomUUID(),
    scope,
    maximumAmount: budget,
    currency: "USD",
    minimumScreenSize: /monitor/i.test(joinedContext)
      ? Number(screenSizeMatch?.[1] ?? 34)
      : undefined,
    validUntil: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    validityHours: 72,
    paymentMethodId: "",
    status: "pending",
    mockOutcome,
  };
}

export async function analyzeMockRequest(
  message: string,
  context: ChatMessage[],
): Promise<AgentResponse> {
  await delay(850);

  const hasEarlierClarification = context.some(
    (item) =>
      item.role === "assistant" &&
      item.content.includes("minimum screen size"),
  );

  if (
    /monitor/i.test(message) &&
    !hasMonitorDetails(message) &&
    !hasEarlierClarification
  ) {
    return {
      kind: "clarification",
      message: "What is the minimum screen size you are looking for, and what is your maximum budget?",
    };
  }

  const mandate = makeMandate(message, context);
  return {
    kind: "mandate",
    message:
      "I translated your request into a limited purchase mandate. Review the scope and spending cap before you approve it.",
    mandate,
  };
}

export async function executeMockPurchase(
  mandate: Mandate,
  paymentMethod: PaymentMethod,
): Promise<PurchaseResponse> {
  await delay(1_150);

  const applianceSearch = /appliance|eletrodomestic/i.test(mandate.scope);
  const candidates = applianceSearch
    ? [
        { id: "offer-kettle", merchant: "Casa Nova", item: "Temperature-control electric kettle", price: 69 },
        { id: "offer-blender", merchant: "Lar & Co.", item: "Compact countertop blender", price: 89 },
        { id: "offer-toaster", merchant: "Home Circuit", item: "Two-slice digital toaster", price: 109 },
      ]
    : [
        { id: "offer-aster", merchant: "Northstar Displays", item: "Aster 34-inch UWQHD Monitor", price: 292.43 },
        { id: "offer-orbit", merchant: "Orbit Electronics", item: "Orbit 34-inch Curved Monitor", price: 319 },
        { id: "offer-canvas", merchant: "Canvas Computing", item: "Canvas 32-inch QHD Monitor", price: 249 },
      ];
  const selected = candidates.find((offer) => offer.price <= mandate.maximumAmount);
  const listings: MarketplaceListing[] = candidates.map((offer) => ({
    ...offer,
    currency: "USD",
    merchantVerified: true,
    qualifies: offer.price <= mandate.maximumAmount,
    selected: offer.id === selected?.id,
  }));

  if (!selected || mandate.mockOutcome === "scheduled") {
    return {
      kind: "scheduled",
      message: "No qualifying offer is available yet. Your approved search mandate remains active.",
      listings,
      scheduledPurchase: {
        id: `SCH-${mandate.id.slice(0, 8).toUpperCase()}`,
        mandateId: mandate.id,
        scope: mandate.scope,
        maximumAmount: mandate.maximumAmount,
        currency: "USD",
        createdAt: new Date().toISOString(),
        validUntil: mandate.validUntil,
        validityHours: mandate.validityHours,
        paymentMethod: {
          brand: paymentMethod.brand,
          label: paymentMethod.label,
          last4: paymentMethod.last4,
        },
        status: "searching",
      },
    };
  }

  return {
    kind: "purchased",
    message: "Search complete. The agent automatically selected and purchased the best qualifying verified offer.",
    listings,
    receipt: {
      id: `RCT-${mandate.id.slice(0, 8).toUpperCase()}`,
      mandateId: mandate.id,
      merchant: selected.merchant,
      item: selected.item,
      subtotal: selected.price,
      taxes: 0,
      total: selected.price,
      currency: "USD",
      purchasedAt: new Date().toISOString(),
      paymentMethod: {
        brand: paymentMethod.brand,
        label: paymentMethod.label,
        last4: paymentMethod.last4,
      },
      status: "approved",
    },
  };
}
