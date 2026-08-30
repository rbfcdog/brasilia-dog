import { authenticatePasskey } from "@/hooks/use-passkey";
import {
  getPasskeySessionToken,
  storePasskeySessionToken,
} from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import type {
  BiometricApprovalProvider,
  BiometricApprovalResult,
} from "@/types/shopping";


export const passkeyBiometricProvider: BiometricApprovalProvider = {
  async approve(): Promise<BiometricApprovalResult> {
    const approvedAt = new Date().toISOString();
    const sessionToken = getPasskeySessionToken();
    if (!sessionToken || typeof window === "undefined" || !("credentials" in navigator)) {
      return { approved: false, method: "passkey", approvedAt };
    }

    try {
      const session = await backendService.verifyPasskeySession(sessionToken);
      const result = await authenticatePasskey(session.userId);
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
