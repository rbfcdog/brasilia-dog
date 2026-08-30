export interface AuthUser {
  id: string;
  email: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { error?: string; detail?: string } | T | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === "object" && "detail" in payload && payload.detail
      ? payload.detail
      : payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : `Authentication failed with status ${response.status}.`);
  }
  return payload as T;
}

export const authService = {
  session: () => request<{ user: AuthUser | null }>("session"),
  signIn: (email: string, password: string) => request<{ user: AuthUser }>("sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),
  merchantDemo: () => request<{ user: AuthUser; demo: true }>("merchant-demo", { method: "POST" }),
  signUp: (input: { email: string; password: string; cpf: string; role: "buyer" | "merchant"; businessName?: string; cnpj?: string }) =>
    request<{ user?: AuthUser; confirmationRequired: boolean }>("sign-up", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  signOut: () => request<{ signedOut: true }>("sign-out", { method: "POST" }),
};
