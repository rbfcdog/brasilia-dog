import type {
  BiometricApprovalProvider,
  BiometricApprovalResult,
} from "@/types/shopping";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const simulatedBiometricProvider: BiometricApprovalProvider = {
  async approve(): Promise<BiometricApprovalResult> {
    await wait(700);
    return {
      approved: true,
      method: "simulated",
      approvedAt: new Date().toISOString(),
    };
  },
};
