import { useEffect, useRef, useState } from "react";
import { listZoneSnapshots } from "@/api/sensors";
import type { ZoneSnapshot } from "@/api/types";
import SensorAlertBanner, { sensorAlertTitle, sensorPointDigest } from "@/components/SensorAlertBanner";
import { useSensorWs } from "@/hooks/useSensorWs";
import { useSensorSnapshotPolling } from "@/hooks/useSensorSnapshotPolling";
import { useTimedSensorAlertBanner } from "@/hooks/useTimedSensorAlertBanner";
import clsx from "clsx";

const POLL_MS = 30_000;

async function fetchPublicSnapshots(): Promise<ZoneSnapshot[]> {
  const rows = await listZoneSnapshots();
  return rows.filter((x) => x.zone.isPublic);
}

/**
 * 橱窗页：大屏视角的全库区状态。
 * 仅展示 is_public=1 的库区（接口返回所有，前端再过滤更稳）。
 *
 * Step 5：与仪表盘一致的 WS 告警 + 断线时轮询快照 `isAnomaly` 条幅（仅针对当前公开列表内库区）。
 */
export default function ShowcasePage() {
  const [snaps, setSnaps] = useState<ZoneSnapshot[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const { alert, show: showAlert, dismiss: dismissAlert } = useTimedSensorAlertBanner();
  const pollAlertDedupRef = useRef("");
  const snapsRef = useRef<ZoneSnapshot[]>([]);
  snapsRef.current = snaps;

  useEffect(() => {
    let live = true;
    fetchPublicSnapshots()
      .then((s) => live && setSnaps(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useSensorSnapshotPolling({
    intervalMs: POLL_MS,
    paused: wsConnected,
    fetcher: fetchPublicSnapshots,
    onSuccess: setSnaps,
  });

  /** 断线时：公开列表内若快照带异常标记，打条条幅（与 Dashboard 同源组件）。 */
  useEffect(() => {
    if (wsConnected) {
      pollAlertDedupRef.current = "";
      return;
    }
    const hit = snaps.find((s) => s.latest?.isAnomaly);
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
  }, [wsConnected, snaps, showAlert]);

  useSensorWs({
    onConnectionChange: setWsConnected,
    onSensor: (e) => {
      setSnaps((prev) => {
        if (!prev.some((s) => s.zone.id === e.zoneId)) return prev;
        return prev.map((s) => (s.zone.id === e.zoneId ? { ...s, latest: e.data } : s));
      });
    },
    onAlert: (e) => {
      if (!snapsRef.current.some((s) => s.zone.id === e.zoneId)) return;
      showAlert({
        title: sensorAlertTitle(e.zoneName, e.zoneCode, e.level),
        reasons: e.reasons.length ? e.reasons : [sensorPointDigest(e.data)],
        level: e.level,
        channel: "live",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">橱窗（公开视图）</h1>
        <p className="mt-1 text-xs text-slate-500">
          面向终端顾客 / 大屏展示：仅显示 is_public=1 的库区 ·{" "}
          {wsConnected ? "WebSocket 已连接" : `WS 离线 · HTTP ${POLL_MS / 1000}s 兜底`}
        </p>
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

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {snaps.map((s) => {
          const t = s.latest?.temperature ?? null;
          const inRange = t != null && t >= s.zone.tempMin && t <= s.zone.tempMax;
          return (
            <div
              key={s.zone.id}
              className={clsx(
                "relative overflow-hidden rounded-2xl p-6 text-white shadow-lg",
                inRange
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                  : t == null
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
              <div className="mt-1 text-xs opacity-80">
                允许 {s.zone.tempMin} ~ {s.zone.tempMax} °C
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <Box label="湿度" value={s.latest?.humidity != null ? `${s.latest.humidity.toFixed(0)}%` : "--"} />
                <Box label="CO₂" value={s.latest?.co2 != null ? `${Math.round(s.latest.co2)} ppm` : "--"} />
                <Box
                  label="门状态"
                  value={
                    s.latest?.doorStatus === "open" ? "开" : s.latest?.doorStatus === "closed" ? "关" : "--"
                  }
                />
              </div>

              <div className="absolute right-4 top-4 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {!inRange && t != null
                  ? "▲ 越阈"
                  : s.latest?.isAnomaly
                    ? "⚠ 异常标记"
                    : inRange
                      ? "● 正常"
                      : "○ 无数据"}
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
    <div className="rounded-lg bg-white/15 px-3 py-2">
      <div className="text-[10px] opacity-75">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
