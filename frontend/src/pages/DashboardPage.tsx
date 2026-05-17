import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import ZoneCard from "@/components/ZoneCard";
import TemperatureChart, { pointsFromSensors } from "@/components/TemperatureChart";
import { listZoneSnapshots, getZoneSeries } from "@/api/sensors";
import type { SensorPoint, Zone, ZoneSnapshot } from "@/api/types";
import { useSensorWs } from "@/hooks/useSensorWs";
import { mergeLatestPointIntoSeries } from "@/hooks/sensorSeriesMerge";
import { useSensorSnapshotPolling } from "@/hooks/useSensorSnapshotPolling";
import { useTimedSensorAlertBanner } from "@/hooks/useTimedSensorAlertBanner";
import SensorAlertBanner, { sensorAlertTitle, sensorPointDigest } from "@/components/SensorAlertBanner";

const MAX_LIVE_POINTS = 720; // 2h × (1 点/10s)
const POLL_MS = 30_000;

export default function DashboardPage() {
  const nav = useNavigate();
  const [snapshots, setSnapshots] = useState<ZoneSnapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [series, setSeries] = useState<SensorPoint[]>([]);
  const { alert, show: showAlert, dismiss: dismissAlert } = useTimedSensorAlertBanner();
  const [wsConnected, setWsConnected] = useState(false);
  const selectedRef = useRef<number | null>(null);
  const pollAlertDedupRef = useRef("");
  selectedRef.current = selected;

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
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时跑一次
  }, []);

  // 选中库区的初始 2h 曲线
  useEffect(() => {
    if (selected == null) return;
    let live = true;
    getZoneSeries(selected, { window: "2h" })
      .then((r) => {
        if (live) setSeries(r.points);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selected]);

  // WS 不可用时的 HTTP 30s 兜底：刷新库区卡片；向当前库区曲线对齐最新一点
  useSensorSnapshotPolling({
    intervalMs: POLL_MS,
    paused: wsConnected,
    fetcher: listZoneSnapshots,
    onSuccess: (next) => {
      setSnapshots(next);
      const sid = selectedRef.current;
      if (sid == null) return;
      const row = next.find((x) => x.zone.id === sid);
      if (!row?.latest) return;
      setSeries((prev) => mergeLatestPointIntoSeries(prev, row.latest, MAX_LIVE_POINTS));
    },
  });

  /** WebSocket 断线时依据 REST 快照里 isAnomaly 打一条条幅（服务端已入库站内信，此处补强可见性）。 */
  useEffect(() => {
    if (wsConnected) {
      pollAlertDedupRef.current = "";
      return;
    }
    const hit = snapshots.find((s) => s.latest?.isAnomaly);
    if (!hit?.latest?.isAnomaly) return;
    const key = `${hit.zone.id}:${hit.latest.recordedAt}`;
    if (pollAlertDedupRef.current === key) return;
    pollAlertDedupRef.current = key;
    showAlert({
      title: sensorAlertTitle(hit.zone.name, hit.zone.code, "critical"),
      reasons: [
        "WebSocket 未连接时由 HTTP 兜底发现异常标记；请以「通知中心」记录为准，并检查网络或服务状态。",
        sensorPointDigest(hit.latest),
      ],
      level: "critical",
      channel: "fallback",
    });
  }, [wsConnected, snapshots, showAlert]);

  // 实时推送
  useSensorWs({
    onConnectionChange: setWsConnected,
    onSensor: (e) => {
      setSnapshots((prev) =>
        prev.map((s) => (s.zone.id === e.zoneId ? { ...s, latest: e.data } : s)),
      );
      if (e.zoneId === selectedRef.current) {
        setSeries((prev) => mergeLatestPointIntoSeries(prev, e.data, MAX_LIVE_POINTS));
      }
    },
    onAlert: (e) => {
      showAlert({
        title: sensorAlertTitle(e.zoneName, e.zoneCode, e.level),
        reasons: e.reasons.length ? e.reasons : [sensorPointDigest(e.data)],
        level: e.level,
        channel: "live",
      });
    },
  });

  const selectedZone = useMemo<Zone | null>(
    () => snapshots.find((s) => s.zone.id === selected)?.zone ?? null,
    [snapshots, selected],
  );
  const chartPoints = useMemo(() => pointsFromSensors(series), [series]);

  const linkHint = wsConnected
    ? "实时 WebSocket，已启用"
    : `WebSocket 未连接 · HTTP 每 ${POLL_MS / 1000}s 兜底刷新`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <h1 className="text-xl font-semibold text-slate-900">实时仪表盘</h1>
        <span className="text-xs text-slate-500">
          {linkHint} · 当前 {snapshots.length} 个库区
        </span>
      </div>

      {alert ? (
        <SensorAlertBanner
          title={alert.title}
          reasons={alert.reasons}
          level={alert.level}
          channel={alert.channel}
          notificationsTo="/notifications"
          onDismiss={dismissAlert}
        />
      ) : null}

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
              最近 2 小时温度（红虚线 = 阈值；优先 WebSocket 追加，离线时由兜底轮询补点）
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
          {series[0]?.recordedAt ? dayjs(series[0].recordedAt).format("HH:mm:ss") : "—"} ~{" "}
          {series[series.length - 1]?.recordedAt
            ? dayjs(series[series.length - 1].recordedAt).format("HH:mm:ss")
            : "—"}
        </div>
      </div>
    </div>
  );
}
