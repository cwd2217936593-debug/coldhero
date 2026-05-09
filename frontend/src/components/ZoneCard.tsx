import clsx from "clsx";
import dayjs from "dayjs";
import type { SensorPoint, Zone } from "@/api/types";

interface Props {
  zone: Zone;
  latest: SensorPoint | null;
  onClick?: () => void;
  pulse?: boolean;
}

function tempStateClass(t: number | null, zone: Zone): string {
  if (t === null) return "text-slate-400";
  if (t < zone.tempMin || t > zone.tempMax) return "text-rose-600";
  return "text-emerald-600";
}

export default function ZoneCard({ zone, latest, onClick, pulse }: Props) {
  const t = latest?.temperature ?? null;
  const isAnomaly = latest?.isAnomaly ?? false;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "text-left bg-white rounded-2xl shadow-sm border transition group hover:shadow-md hover:-translate-y-0.5",
        isAnomaly ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-200",
      )}
    >
      <div className="px-5 pt-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">{zone.code}</div>
          <div className="font-semibold text-slate-800">{zone.name}</div>
        </div>
        {isAnomaly ? (
          <span className={clsx(
            "text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700",
            pulse && "animate-pulse-soft",
          )}>异常</span>
        ) : latest ? (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">正常</span>
        ) : (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">无数据</span>
        )}
      </div>

      <div className="px-5 pt-3 flex items-baseline gap-1">
        <span className={clsx("text-4xl font-bold tabular-nums", tempStateClass(t, zone))}>
          {t !== null ? t.toFixed(1) : "--"}
        </span>
        <span className="text-slate-500 text-sm">°C</span>
      </div>
      <div className="px-5 text-[11px] text-slate-400 mt-1">
        阈值 {zone.tempMin}°C ~ {zone.tempMax}°C
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
        <Stat label="湿度"   value={latest?.humidity != null ? latest.humidity.toFixed(0) + "%" : "--"} />
        <Stat label="CO₂"    value={latest?.co2 != null ? Math.round(latest.co2) + "ppm" : "--"} />
        <Stat label="门" value={latest?.doorStatus === "open" ? "开" : latest?.doorStatus === "closed" ? "关" : "--"}
              danger={latest?.doorStatus === "open"} />
      </div>

      <div className="px-5 py-2 text-[10.5px] text-slate-400 border-t border-slate-100">
        最近更新：{latest ? dayjs(latest.recordedAt).format("HH:mm:ss") : "—"}
      </div>
    </button>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={clsx(
      "rounded-md py-1.5 px-2 bg-slate-50 text-center",
      danger && "bg-amber-50 text-amber-700",
    )}>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
