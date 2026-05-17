/**
 * 单库区实时详情（提示词 Step 6 API `/zones/:id/realtime`；本页编排为 Step 11）
 * — 面包屑：监控 &gt; 客户 &gt; 库区；6 张实时卡 + ECharts 温湿双 Y 轴（阈值参考线）；约 30s 轮询（仅标签页前台）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { adminApi } from "@/api/admin";

const DEFAULT_THRESHOLDS = { tempMin: -25, tempMax: -10, humidityMax: 85 };

export default function ZoneDetailPage() {
  const { zoneId } = useParams();
  const id = Number(zoneId);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.zoneRealtime>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const tabVisibleRef = useRef(true);

  useEffect(() => {
    const sync = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    try {
      const d = await adminApi.zoneRealtime(id);
      setData(d);
      setLastSyncedAt(new Date());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (!tabVisibleRef.current) return;
      void load();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const thr = data?.alertThresholds ?? DEFAULT_THRESHOLDS;

  const chartOption = useMemo(() => {
    if (!data?.trend?.length) {
      return {
        title: { text: "暂无趋势数据", left: "center", textStyle: { fontSize: 14, color: "#64748b" } },
      };
    }
    const times = data.trend.map((p) => {
      const ts = p.recorded_at;
      return typeof ts === "string" ? ts.slice(11, 16) : "";
    });
    const temps = data.trend.map((p) =>
      p.temperature !== null && p.temperature !== undefined ? Number(p.temperature) : null,
    );
    const hums = data.trend.map((p) =>
      p.humidity !== null && p.humidity !== undefined ? Number(p.humidity) : null,
    );
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["温度℃", "湿度%"] },
      grid: { left: 48, right: 48, top: 40, bottom: 24 },
      xAxis: { type: "category", data: times, boundaryGap: false },
      yAxis: [
        { type: "value", name: "℃", splitLine: { lineStyle: { type: "dashed" } } },
        { type: "value", name: "%", splitLine: { show: false } },
      ],
      series: [
        {
          name: "温度℃",
          type: "line",
          smooth: true,
          data: temps,
          yAxisIndex: 0,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", opacity: 0.7 },
            data: [
              {
                yAxis: thr.tempMin,
                label: { formatter: `温度下限 ${thr.tempMin}℃`, color: "#64748b", fontSize: 10 },
              },
              {
                yAxis: thr.tempMax,
                label: { formatter: `温度上限 ${thr.tempMax}℃`, color: "#64748b", fontSize: 10 },
              },
            ],
          },
        },
        {
          name: "湿度%",
          type: "line",
          smooth: true,
          data: hums,
          yAxisIndex: 1,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", opacity: 0.7, color: "#0ea5e9" },
            data: [
              {
                yAxis: thr.humidityMax,
                yAxisIndex: 1,
                label: { formatter: `湿度上限 ${thr.humidityMax}%`, color: "#0369a1", fontSize: 10 },
              },
            ],
          },
        },
      ],
    };
  }, [data, thr.tempMin, thr.tempMax, thr.humidityMax]);

  if (!Number.isFinite(id) || id <= 0) {
    return <div className="text-sm text-rose-600">无效的库区 ID</div>;
  }

  const t = data?.temperature;
  const h = data?.humidity;
  const tempAlert = t !== null && t !== undefined && (t < thr.tempMin || t > thr.tempMax);
  const humAlert = h !== null && h !== undefined && h > thr.humidityMax;
  const cust = data?.customerName;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600" aria-label="面包屑">
        <div>
          <Link to="/admin/monitor" className="text-brand-600 hover:underline">
            监控
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-900">{cust ?? "未绑定客户"}</span>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">{data?.zone.name ?? `库区 #${id}`}</span>
        </div>
        {lastSyncedAt ? (
          <span className="text-xs text-slate-400">上次同步 {lastSyncedAt.toLocaleTimeString("zh-CN")}</span>
        ) : null}
      </nav>

      {data && !data.isOnline ? (
        <div className="rounded-lg bg-rose-600 px-4 py-2 text-center text-sm text-white">设备离线</div>
      ) : null}

      {err ? <div className="text-sm text-rose-600">{err}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="温度 ℃" value={t ?? "—"} alert={tempAlert} />
        <Metric label="湿度 %" value={h ?? "—"} alert={humAlert} />
        <Metric label="CO₂" value={data?.co2 ?? "—"} />
        <Metric label="门状态" value={data?.doorStatus ?? "—"} />
        <Metric label="电流 A" value={data?.currentAmpere ?? "—"} />
        <Metric label="运行时长(分)" value={data?.runMinutes ?? "—"} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium text-slate-800">近 1 小时趋势（虚线为告警阈值）</div>
        <ReactECharts style={{ height: 320 }} option={chartOption} notMerge lazyUpdate />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <div>
          设备 SN：<span className="text-slate-900">{data?.zone.device_sn ?? "—"}</span>
        </div>
        <div className="mt-1">
          库区编码：<span className="text-slate-900">{data?.zone.code ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 shadow-sm ${
        alert ? "border-rose-400 ring-1 ring-rose-200" : "border-slate-200"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
