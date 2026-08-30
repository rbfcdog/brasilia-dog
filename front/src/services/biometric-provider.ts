import { authenticatePasskey } from "@/hooks/use-passkey";
import { storePasskeySessionToken } from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import type {
  BiometricApprovalMode,
  BiometricApprovalProvider,
  BiometricApprovalResult,
  Mandate,
} from "@/types/shopping";

export const passkeyBiometricProvider: BiometricApprovalProvider = {
  async approve(_mandate: Mandate, mode: BiometricApprovalMode = "passkey"): Promise<BiometricApprovalResult> {
    const approvedAt = new Date().toISOString();
    if (mode === "demo") {
      try {
        const result = await backendService.demoPasskeyVerify();
        if (result.verified && result.sessionToken) {
          storePasskeySessionToken(result.sessionToken);
          return { approved: true, method: "demo", approvedAt };
        }
      } catch {
        return { approved: false, method: "demo", approvedAt };
      }
      return { approved: false, method: "demo", approvedAt };
    }
    if (typeof window === "undefined" || !("credentials" in navigator)) {
      return { approved: false, method: "passkey", approvedAt };
    }

    try {
      const result = await authenticatePasskey();
      if (!result.verified || !result.sessionToken) {
        return { approved: false, method: "passkey", approvedAt };
      }

      storePasskeySessionToken(result.sessionToken);
      return { approved: true, method: "passkey", approvedAt };
    } catch {
      return { approved: false, method: "passkey", approvedAt };
    }
  },
};
