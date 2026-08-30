import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/agent/route";

describe("agent chat BFF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.AGENT_SERVICE_TOKEN;
  });

  it("forwards a chat request to the agent with the server-only service token", async () => {
    process.env.AGENT_SERVICE_URL = "https://agent.example.test";
    process.env.AGENT_SERVICE_TOKEN = "agent-service-token-12345";
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { kind: "clarification", message: "What is your maximum budget?" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "I need a 34-inch ultrawide monitor.",
        conversationId: "conversation-123",
      }),
    }));

    const call = upstream.mock.calls[0];
    expect(String(call?.[0])).toBe("https://agent.example.test/v1/chat");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer agent-service-token-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "I need a 34-inch ultrawide monitor.",
        conversationId: "conversation-123",
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { kind: "clarification", message: "What is your maximum budget?" },
    });
  });
});
