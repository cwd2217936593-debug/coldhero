import clsx from "clsx";
import { SEVERITY_META, STATUS_META } from "@/api/fault";
import type { FaultSeverity, FaultStatus } from "@/api/types";

export function SeverityPill({ value, className }: { value: FaultSeverity; className?: string }) {
  const m = SEVERITY_META[value];
  return <span className={clsx("text-xs px-2 py-0.5 rounded-full", m.classes, className)}>{m.label}</span>;
}

export function StatusPill({ value, className }: { value: FaultStatus; className?: string }) {
  const m = STATUS_META[value];
  return <span className={clsx("text-xs px-2 py-0.5 rounded-full", m.classes, className)}>{m.label}</span>;
}
