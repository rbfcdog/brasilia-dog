import { authenticatePasskey } from "@/hooks/use-passkey";
import { storePasskeySessionToken } from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import type {
  BiometricApprovalProvider,
  BiometricApprovalResult,
} from "@/types/shopping";

const demoPasskeyEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const passkeyBiometricProvider: BiometricApprovalProvider = {
  async approve(): Promise<BiometricApprovalResult> {
    const approvedAt = new Date().toISOString();
    if (demoPasskeyEnabled) {
      try {
        const result = await backendService.demoPasskeyVerify();
        if (result.verified && result.sessionToken) {
          storePasskeySessionToken(result.sessionToken);
          return { approved: true, method: "passkey", approvedAt };
        }
      } catch {
        return { approved: false, method: "passkey", approvedAt };
      }
      return { approved: false, method: "passkey", approvedAt };
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
