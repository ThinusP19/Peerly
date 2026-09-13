import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  FileEdit,
  Link2,
  Link2Off,
  Lock,
  Unlock,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusKind =
  | "draft"
  | "open"
  | "closed"
  | "submitted"
  | "outstanding"
  | "not-started"
  | "in-progress"
  | "matched"
  | "unmatched"
  | "conflict"
  | "missed"
  | "active"
  | "deactivated"
  | "unverified";

const tones = {
  success: "bg-success-muted text-success border-success/30",
  warning: "bg-warning-muted text-warning border-warning/30",
  danger: "bg-danger-muted text-danger border-danger/30",
  neutral: "bg-neutral-status-muted text-neutral-status border-border",
  info: "bg-accent text-accent-foreground border-primary/25",
} as const;

const config: Record<StatusKind, { label: string; icon: LucideIcon; tone: keyof typeof tones }> = {
  draft: { label: "Draft", icon: FileEdit, tone: "neutral" },
  open: { label: "Open", icon: Unlock, tone: "success" },
  closed: { label: "Closed", icon: Lock, tone: "neutral" },
  submitted: { label: "Submitted", icon: CheckCircle2, tone: "success" },
  outstanding: { label: "Outstanding", icon: Clock, tone: "warning" },
  "not-started": { label: "Not started", icon: CircleDashed, tone: "neutral" },
  "in-progress": { label: "In progress", icon: FileEdit, tone: "info" },
  matched: { label: "Matched", icon: Link2, tone: "success" },
  unmatched: { label: "Unmatched", icon: Link2Off, tone: "warning" },
  conflict: { label: "Conflict", icon: AlertTriangle, tone: "danger" },
  missed: { label: "Closed - not submitted", icon: XCircle, tone: "danger" },
  active: { label: "Active", icon: CheckCircle2, tone: "success" },
  deactivated: { label: "Deactivated", icon: CircleSlash, tone: "neutral" },
  unverified: { label: "Unverified", icon: Clock, tone: "warning" },
};

/**
 * Status is always text + icon, never colour alone (accessibility requirement).
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind;
  label?: string;
  className?: string;
}) {
  const { label: defaultLabel, icon: Icon, tone } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  );
}

export const accountStatusKind = (status: "active" | "inactive" | "unverified"): StatusKind =>
  status === "active" ? "active" : status === "inactive" ? "deactivated" : "unverified";
