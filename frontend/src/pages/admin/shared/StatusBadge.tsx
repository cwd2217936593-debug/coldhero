import clsx from "clsx";

const STYLES: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-800",
  offline: "bg-slate-200 text-slate-700",
  alert: "bg-rose-100 text-rose-800",
  pending: "bg-amber-100 text-amber-900",
  assigned: "bg-sky-100 text-sky-900",
  arrived: "bg-indigo-100 text-indigo-900",
  in_progress: "bg-violet-100 text-violet-900",
  done: "bg-emerald-50 text-emerald-900",
  closed: "bg-slate-100 text-slate-600",
  rejected: "bg-rose-50 text-rose-800",
};

export default function StatusBadge({
  kind,
  children,
}: {
  kind: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex rounded px-2 py-0.5 text-xs font-medium",
        STYLES[kind] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {children}
    </span>
  );
}
