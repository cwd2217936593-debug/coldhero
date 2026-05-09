import { useEffect, useState } from "react";
import { listZoneSnapshots } from "@/api/sensors";
import type { ZoneSnapshot } from "@/api/types";
import { useSensorWs } from "@/hooks/useSensorWs";
import clsx from "clsx";

/**
 * 橱窗页：大屏视角的全库区状态。
 * 仅展示 is_public=1 的库区（接口返回所有，前端再过滤更稳）。
 */
export default function ShowcasePage() {
  const [snaps, setSnaps] = useState<ZoneSnapshot[]>([]);

  useEffect(() => {
    let live = true;
    listZoneSnapshots()
      .then((s) => live && setSnaps(s.filter((x) => x.zone.isPublic)))
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  useSensorWs({
    onSensor: (e) => {
      setSnaps((prev) =>
        prev.map((s) => (s.zone.id === e.zoneId ? { ...s, latest: e.data } : s)),
      );
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">橱窗（公开视图）</h1>
        <p className="text-xs text-slate-500 mt-1">面向终端顾客 / 大屏展示：仅显示 is_public=1 的库区</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {snaps.map((s) => {
          const t = s.latest?.temperature ?? null;
          const inRange = t != null && t >= s.zone.tempMin && t <= s.zone.tempMax;
          return (
            <div
              key={s.zone.id}
              className={clsx(
                "rounded-2xl p-6 text-white shadow-lg overflow-hidden relative",
                inRange ? "bg-gradient-to-br from-emerald-500 to-teal-600" : t == null
                  ? "bg-gradient-to-br from-slate-500 to-slate-700"
                  : "bg-gradient-to-br from-rose-500 to-pink-600",
              )}
            >
              <div className="text-sm opacity-80">{s.zone.code}</div>
              <div className="text-2xl font-semibold">{s.zone.name}</div>

              <div className="mt-6 flex items-baseline gap-2">
                <div className="text-6xl font-bold tabular-nums">{t != null ? t.toFixed(1) : "--"}</div>
                <div className="text-xl">°C</div>
              </div>
              <div className="text-xs opacity-80 mt-1">允许 {s.zone.tempMin} ~ {s.zone.tempMax} °C</div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <Box label="湿度" value={s.latest?.humidity != null ? `${s.latest.humidity.toFixed(0)}%` : "--"} />
                <Box label="CO₂"   value={s.latest?.co2 != null ? `${Math.round(s.latest.co2)} ppm` : "--"} />
                <Box label="门状态" value={s.latest?.doorStatus === "open" ? "开" : s.latest?.doorStatus === "closed" ? "关" : "--"} />
              </div>

              <div className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-white/20">
                {inRange ? "● 正常" : t == null ? "○ 无数据" : "▲ 异常"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/15 rounded-lg px-3 py-2">
      <div className="text-[10px] opacity-75">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
