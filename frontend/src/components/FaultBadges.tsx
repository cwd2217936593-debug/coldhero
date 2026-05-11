import clsx from "clsx";
import { SEVERITY_META, STATUS_META } from "@/api/fault";
import type { FaultSeverity, FaultStatus } from "@/api/types";

export function SeverityPill({ value, className }: { value: FaultSeverity; className?: string }) {
  const m = SEVERITY_META[value];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs leading-none",
        m.classes,
        className,
      )}
    >
      {m.label}
    </span>
  );
}

export function StatusPill({ value, className }: { value: FaultStatus; className?: string }) {
  const m = STATUS_META[value];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs leading-none",
        m.classes,
        className,
      )}
    >
      {m.label}
    </span>
  );
}
