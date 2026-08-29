const PASSKEY_SESSION_STORAGE_KEY = "brasilia-dog.passkey-session";

export function getPasskeySessionToken(): string | null {
  if (typeof window === "undefined") return null;

  return window.sessionStorage.getItem(PASSKEY_SESSION_STORAGE_KEY);
}

export function storePasskeySessionToken(token: string): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(PASSKEY_SESSION_STORAGE_KEY, token);
}

export function clearPasskeySessionToken(): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(PASSKEY_SESSION_STORAGE_KEY);
}
