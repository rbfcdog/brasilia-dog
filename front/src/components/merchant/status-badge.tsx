import type { PaymentStatus, ProductStatus, RefundCaseStatus, RiskLevel } from "@/types/merchant";
import { humanizeCode } from "@/lib/merchant-format";

const tones: Record<string, string> = {
  settled: "bg-success/45 text-success-ink",
  published: "bg-success/45 text-success-ink",
  completed: "bg-success/45 text-success-ink",
  approved: "bg-success/45 text-success-ink",
  low: "bg-success/45 text-success-ink",
  challenged: "bg-warning-soft text-warning-ink",
  requested: "bg-warning-soft text-warning-ink",
  under_review: "bg-warning-soft text-warning-ink",
  medium: "bg-warning-soft text-warning-ink",
  draft: "bg-primary-soft text-primary",
  failed: "bg-danger-soft text-danger",
  refunded: "bg-danger-soft text-danger",
  rejected: "bg-danger-soft text-danger",
  high: "bg-danger-soft text-danger",
  archived: "bg-canvas text-subtle",
};

export function StatusBadge({ value }: { value: PaymentStatus | ProductStatus | RefundCaseStatus | RiskLevel }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${tones[value] ?? "bg-canvas text-subtle"}`}>
      {humanizeCode(value)}
    </span>
  );
}
