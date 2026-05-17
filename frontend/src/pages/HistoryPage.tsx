import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import clsx from "clsx";
import { listZones, getZoneCompare } from "@/api/sensors";
import { errMessage } from "@/api/client";
import type { CompareResp, Zone } from "@/api/types";
import GbrDemoPredictor from "@/components/GbrDemoPredictor";

const RANGES = [
  { label: "近 1 小时",  hours: 1 },
  { label: "近 6 小时",  hours: 6 },
  { label: "近 24 小时", hours: 24 },
  { label: "近 3 天",    hours: 72 },
  { label: "近 7 天",    hours: 168 },
];

/** 历史查询与 `/compare`（README 阶段 6）；定时将时间窗对齐到「当前时刻」并静默刷新图表 */
const POLL_MS = 60_000;

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<CompareResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const tabVisibleRef = useRef(true);

  useEffect(() => {
    const sync = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    listZones().then((zs) => {
      setZones(zs);
      const initial = Number(params.get("zoneId")) || zs[0]?.id || null;
      setZoneId(initial);
    });
  }, []);

  const loadCompare = useCallback(
    async (mode: "full" | "quiet") => {
      if (zoneId == null) return;
      const quiet = mode === "quiet";
      if (quiet) setBgBusy(true);
      else {
        setLoading(true);
        setErr(null);
      }
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3600 * 1000);
      try {
        const r = await getZoneCompare(zoneId, { from: from.toISOString(), to: to.toISOString() });
        setData(r);
        setLastFetchedAt(new Date());
        setErr(null);
      } catch (e) {
        if (!quiet) setErr(errMessage(e));
      } finally {
        if (quiet) setBgBusy(false);
        else setLoading(false);
      }
    },
    [zoneId, hours],
  );

  useEffect(() => {
    if (zoneId == null) return;
    void loadCompare("full");
    setParams({ zoneId: String(zoneId) }, { replace: true });
  }, [zoneId, hours, loadCompare, setParams]);

  useEffect(() => {
    if (zoneId == null) return;
    const id = window.setInterval(() => {
      if (!tabVisibleRef.current) return;
      void loadCompare("quiet");
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [zoneId, loadCompare]);

  const zone = useMemo<Zone | null>(
    () => zones.find((z) => z.id === zoneId) ?? null,
    [zones, zoneId],
  );

  const chartOption = useMemo(() => buildOption(data, zone), [data, zone]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-slate-900">历史查询与模型拟合</h1>
          <span className="text-[11px] text-slate-500">
            区间终点随每次加载对齐当前时间 · 前台可见时每 {POLL_MS / 1000}s 静默刷新 · 会员历史深度仍由服务端按档位裁剪
            {lastFetchedAt ? ` · 上次更新 ${dayjs(lastFetchedAt).format("HH:mm:ss")}` : ""}
            {bgBusy ? " · 刷新中…" : ""}
          </span>
        </div>
        <select
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          value={zoneId ?? ""}
          onChange={(e) => setZoneId(Number(e.target.value))}
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.code} · {z.name}</option>
          ))}
        </select>
        <div className="flex rounded-md overflow-hidden border border-slate-300 bg-white">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={clsx(
                "px-3 py-1.5 text-xs",
                hours === r.hours ? "bg-brand-600 text-white" : "hover:bg-slate-50",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={loading || zoneId == null}
          onClick={() => void loadCompare("full")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          立即刷新
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="RMSE" value={data.metrics.rmse?.toFixed(3) ?? "—"} unit="°C" tip="均方根误差" />
          <Metric label="MAE"  value={data.metrics.mae?.toFixed(3)  ?? "—"} unit="°C" tip="平均绝对误差" />
          <Metric label="MAPE" value={data.metrics.mape?.toFixed(2) ?? "—"} unit="%"  tip="平均百分比误差" />
          <Metric label="对齐样本" value={String(data.metrics.pairCount)} unit="对" tip={`数据来源：${data.source === "csv" ? "CSV 兑底" : "Python 微服务"}`} />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        {err && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-3">
            ⚠️ {err}
          </div>
        )}
        {loading && <div className="text-xs text-slate-400">加载中...</div>}
        <ReactECharts option={chartOption} style={{ height: 460 }} notMerge lazyUpdate />
        <div className="text-[11px] text-slate-400 mt-2">
          实线 = 实际温度，虚线 = 模型预测；红色虚线为库区温度阈值。
          {zone && <span> 阈值：{zone.tempMin} °C ~ {zone.tempMax} °C</span>}
        </div>
      </div>

      <GbrDemoPredictor />
    </div>
  );
}

function Metric({ label, value, unit, tip }: { label: string; value: string; unit: string; tip: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {value} <span className="text-sm font-normal text-slate-400">{unit}</span>
      </div>
      <div className="text-[11px] text-slate-400 mt-1">{tip}</div>
    </div>
  );
}

function buildOption(data: CompareResp | null, zone: Zone | null) {
  if (!data) {
    return {
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      xAxis: { type: "time" }, yAxis: { type: "value" },
      series: [],
    };
  }
  return {
    grid: { top: 40, right: 20, bottom: 50, left: 50 },
    legend: { top: 0, textStyle: { color: "#64748b" } },
    tooltip: {
      trigger: "axis",
      formatter: (params: { axisValue: string; value: [string, number]; seriesName: string; color: string }[]) => {
        const ts = dayjs(params[0]?.axisValue).format("YYYY-MM-DD HH:mm:ss");
        return [ts, ...params.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]?.toFixed?.(2) ?? "--"} ℃</b>`)].join("<br/>");
      },
    },
    xAxis: { type: "time", axisLabel: { color: "#64748b" } },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: "#64748b", formatter: "{value} ℃" },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
    },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }],
    series: [
      {
        name: "实际温度",
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#1f72ee", width: 2 },
        data: data.actual.map((p) => [p.timestamp, p.temperature]),
        markLine: zone ? {
          symbol: "none",
          silent: true,
          lineStyle: { color: "#f43f5e", type: "dashed", width: 1 },
          data: [
            { yAxis: zone.tempMax, label: { formatter: `上限 ${zone.tempMax}℃`, color: "#f43f5e" } },
            { yAxis: zone.tempMin, label: { formatter: `下限 ${zone.tempMin}℃`, color: "#f43f5e" } },
          ],
        } : undefined,
      },
      {
        name: "模型预测",
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#a855f7", width: 2, type: "dashed" },
        data: data.predicted.map((p) => [p.timestamp, p.temperature]),
      },
    ],
  };
}
