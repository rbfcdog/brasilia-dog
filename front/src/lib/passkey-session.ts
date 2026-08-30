const PASSKEY_SESSION_STORAGE_KEY = "brasilia-dog.passkey-session";
const PASSKEY_SESSION_MARKER = "nomad-passkey-authenticated";

export function getPasskeySessionToken(): string | null {
  if (typeof window === "undefined") return null;

  return window.sessionStorage.getItem(PASSKEY_SESSION_STORAGE_KEY);
}

export function hasPasskeySession(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(getPasskeySessionToken()) ||
    document.cookie.split("; ").some((cookie) => cookie === `${PASSKEY_SESSION_MARKER}=1`);
}

export function storePasskeySessionToken(token: string): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(PASSKEY_SESSION_STORAGE_KEY, token);
  document.cookie = `${PASSKEY_SESSION_MARKER}=1; Path=/; SameSite=Strict`;
}

export function clearPasskeySessionToken(): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(PASSKEY_SESSION_STORAGE_KEY);
  document.cookie = `${PASSKEY_SESSION_MARKER}=; Max-Age=0; Path=/; SameSite=Strict`;
}
