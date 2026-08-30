import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("buyer demo route protection", () => {
  it("allows the buyer workspace after the demo passkey marker is set", () => {
    const request = new NextRequest("https://shop.example.test/assistant", {
      headers: { Cookie: "vero-passkey-authenticated=1" },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects a visitor without an account or demo session", () => {
    const request = new NextRequest("https://shop.example.test/assistant");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://shop.example.test/?next=%2Fassistant#workspace-auth");
  });

  it("does not treat a buyer demo marker as merchant authentication", () => {
    const request = new NextRequest("https://shop.example.test/merchant/dashboard", {
      headers: { Cookie: "vero-passkey-authenticated=1" },
    });

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://shop.example.test/merchant/login?next=%2Fmerchant%2Fdashboard");
  });

  it("does not redirect the merchant login page from an unverified stale cookie", () => {
    const request = new NextRequest("https://shop.example.test/merchant/login", {
      headers: { Cookie: "vero-auth-access=stale-token" },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
