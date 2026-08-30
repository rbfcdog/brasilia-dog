import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/agent/route";

describe("agent chat BFF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.AGENT_SERVICE_TOKEN;
    delete process.env.BACKEND_API_URL;
  });

  it("forwards an anonymous chat request to the agent with the server-only service token", async () => {
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

  it("persists an authenticated agent reply before returning it", async () => {
    process.env.AGENT_SERVICE_URL = "https://agent.example.test";
    process.env.AGENT_SERVICE_TOKEN = "agent-service-token-12345";
    process.env.BACKEND_API_URL = "https://api.example.test";
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: {
          kind: "clarification",
          message: "What is your maximum budget?",
          activity: [{ type: "category_list", categories: ["electronics"] }],
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { id: "message-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event: { id: "event-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        Authorization: "Bearer passkey-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "I need a monitor.",
        conversationId: "conversation-123",
      }),
    }));

    expect(String(upstream.mock.calls[1]?.[0])).toBe(
      "https://api.example.test/v1/conversations/conversation-123/messages",
    );
    expect(upstream.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer passkey-session",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(upstream.mock.calls[1]?.[1]?.body))).toMatchObject({
      role: "assistant",
      content: "What is your maximum budget?",
    });
    expect(String(upstream.mock.calls[2]?.[0])).toBe(
      "https://api.example.test/v1/conversations/conversation-123/events",
    );
    expect(JSON.parse(String(upstream.mock.calls[2]?.[1]?.body))).toMatchObject({
      type: "agent_response",
      payload: {
        kind: "clarification",
        activity: [{ type: "category_list", categories: ["electronics"] }],
      },
    });
    expect(response.status).toBe(200);
  });

  it("records a mandate proposal after saving its agent response", async () => {
    process.env.AGENT_SERVICE_URL = "https://agent.example.test";
    process.env.AGENT_SERVICE_TOKEN = "agent-service-token-12345";
    process.env.BACKEND_API_URL = "https://api.example.test";
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: {
          kind: "mandate",
          message: "Review this limit before approval.",
          mandate: { id: "mandate-1", scope: "ultrawide monitor", maximumAmount: 300 },
          activity: [],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { id: "message-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event: { id: "event-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event: { id: "event-2" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        Authorization: "Bearer passkey-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Buy a monitor.", conversationId: "conversation-123" }),
    }));

    expect(JSON.parse(String(upstream.mock.calls[3]?.[1]?.body))).toMatchObject({
      type: "mandate_proposed",
      payload: { id: "mandate-1", scope: "ultrawide monitor", maximumAmount: 300 },
    });
    expect(response.status).toBe(200);
  });

  it("does not return an authenticated agent reply when backend persistence fails", async () => {
    process.env.AGENT_SERVICE_URL = "https://agent.example.test";
    process.env.AGENT_SERVICE_TOKEN = "agent-service-token-12345";
    process.env.BACKEND_API_URL = "https://api.example.test";
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { kind: "clarification", message: "What is your maximum budget?" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "conversation_message_persistence_failed",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        Authorization: "Bearer passkey-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "I need a monitor.",
        conversationId: "conversation-123",
      }),
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "CONVERSATION_PERSISTENCE_FAILED",
        message: "The agent reply could not be saved to the backend.",
      },
    });
  });
});
