import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import ZoneCard from "@/components/ZoneCard";
import TemperatureChart, { pointsFromSensors } from "@/components/TemperatureChart";
import { listZoneSnapshots, getZoneSeries } from "@/api/sensors";
import type { SensorPoint, Zone, ZoneSnapshot } from "@/api/types";
import { useSensorWs } from "@/hooks/useSensorWs";

const MAX_LIVE_POINTS = 720; // 2h × (1 点/10s)

export default function DashboardPage() {
  const nav = useNavigate();
  const [snapshots, setSnapshots] = useState<ZoneSnapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [series, setSeries] = useState<SensorPoint[]>([]);
  const [alert, setAlert] = useState<{ title: string; reasons: string[]; level: string; ts: number } | null>(null);

  // 首次拉快照
  useEffect(() => {
    let live = true;
    listZoneSnapshots()
      .then((s) => {
        if (!live) return;
        setSnapshots(s);
        if (s.length && selected == null) setSelected(s[0].zone.id);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  // 选中库区的初始 2h 曲线
  useEffect(() => {
    if (selected == null) return;
    let live = true;
    getZoneSeries(selected, { window: "2h" })
      .then((r) => { if (live) setSeries(r.points); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [selected]);

  // 实时推送
  useSensorWs({
    onSensor: (e) => {
      // 更新对应 snapshot
      setSnapshots((prev) =>
        prev.map((s) => (s.zone.id === e.zoneId ? { ...s, latest: e.data } : s)),
      );
      if (e.zoneId === selected) {
        setSeries((prev) => {
          const next = [...prev, e.data];
          if (next.length > MAX_LIVE_POINTS) next.splice(0, next.length - MAX_LIVE_POINTS);
          return next;
        });
      }
    },
    onAlert: (e) => {
      setAlert({ title: `${e.zoneName}（${e.zoneCode}）${labelLevel(e.level)}`, reasons: e.reasons, level: e.level, ts: Date.now() });
      setTimeout(() => setAlert((a) => (a && Date.now() - a.ts > 8000 ? null : a)), 9000);
    },
  });

  const selectedZone = useMemo<Zone | null>(
    () => snapshots.find((s) => s.zone.id === selected)?.zone ?? null,
    [snapshots, selected],
  );
  const chartPoints = useMemo(() => pointsFromSensors(series), [series]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <h1 className="text-xl font-semibold text-slate-900">实时仪表盘</h1>
        <span className="text-xs text-slate-500">实时 WebSocket · 当前 {snapshots.length} 个库区</span>
      </div>

      {alert && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-3
          ${alert.level === "critical" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <span className="text-lg leading-none">⚠️</span>
          <div className="flex-1">
            <div className="font-medium">{alert.title}</div>
            <div className="mt-0.5 text-xs">{alert.reasons.join("；")}</div>
          </div>
          <button onClick={() => setAlert(null)} className="text-xs opacity-60 hover:opacity-100">关闭</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {snapshots.map((s) => (
          <ZoneCard
            key={s.zone.id}
            zone={s.zone}
            latest={s.latest}
            pulse={s.latest?.isAnomaly}
            onClick={() => setSelected(s.zone.id)}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-700">
              {selectedZone ? `${selectedZone.code} · ${selectedZone.name}` : "请选择库区"}
            </div>
            <div className="text-[11px] leading-relaxed text-slate-400">
              最近 2 小时温度（红虚线 = 阈值；新数据由 WebSocket 实时追加）
              {series.length > 0 && ` · 共 ${series.length} 个数据点`}
            </div>
          </div>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && nav(`/history?zoneId=${selected}`)}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50"
          >
            查看历史与拟合 →
          </button>
        </div>
        <TemperatureChart zone={selectedZone} points={chartPoints} />
        <div className="text-[11px] text-slate-400 mt-2">
          数据生成时间区间：
          {series[0]?.recordedAt ? dayjs(series[0].recordedAt).format("HH:mm:ss") : "—"} ~ {" "}
          {series[series.length - 1]?.recordedAt ? dayjs(series[series.length - 1].recordedAt).format("HH:mm:ss") : "—"}
        </div>
      </div>
    </div>
  );
}

function labelLevel(l: string): string {
  return l === "critical" ? "出现严重异常" : l === "warning" ? "出现异常" : "提示";
}
