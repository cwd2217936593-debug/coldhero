import { Link } from "react-router-dom";
import type { SensorPoint } from "@/api/types";

export type SensorAlertChannel = "live" | "fallback";

export interface SensorAlertBannerModel {
  title: string;
  reasons: string[];
  /** 对齐 WS：`info` | `warning` | `critical` */
  level: string;
  channel: SensorAlertChannel;
}

interface Props extends SensorAlertBannerModel {
  onDismiss: () => void;
  /** 若为相对路径则在应用内跳转，例如 `/notifications` */
  notificationsTo?: string;
}

const CHANNEL_LABEL: Record<SensorAlertChannel, string> = {
  live: "实时推送",
  fallback: "HTTP 兜底",
};

/** 与服务端告警 level 对齐的简短标题后缀 */
export function sensorAlertSeverityLabel(level: string): string {
  if (level === "critical") return "严重异常";
  if (level === "warning") return "异常";
  return "提示";
}

export function sensorAlertTitle(zoneName: string, zoneCode: string, level: string): string {
  return `${zoneName}（${zoneCode}）· ${sensorAlertSeverityLabel(level)}`;
}

/** 兜底轮询无法拿到服务端拆解原因时，用读数补足上下文 */
export function sensorPointDigest(p: SensorPoint): string {
  const t = p.temperature != null ? `${p.temperature}` : "—";
  const h = p.humidity != null ? `${p.humidity}` : "—";
  return `最近一次读数：温度 ${t}℃ · 湿度 ${h}% · ${p.recordedAt}`;
}

export default function SensorAlertBanner({
  title,
  reasons,
  level,
  channel,
  onDismiss,
  notificationsTo,
}: Props) {
  const isCritical = level === "critical";
  const palette = isCritical ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800";
  const chip =
    channel === "live"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const linkTone = isCritical ? "text-rose-900 underline-offset-2 hover:underline" : "text-amber-900 underline-offset-2 hover:underline";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${palette}`}>
      <span className="text-lg leading-none">⚠️</span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <span
            title={channel === "live" ? "WebSocket 已连接时由服务端即时推送" : "WebSocket 断开时由定时 HTTP 快照发现"}
            className={`shrink-0 rounded border px-1.5 py-0 text-[10px] font-medium ${chip}`}
          >
            {CHANNEL_LABEL[channel]}
          </span>
          <div className="font-medium">{title}</div>
        </div>
        <div className="mt-1 text-xs leading-relaxed opacity-95">{reasons.join("；")}</div>
        {notificationsTo ? (
          <div className="mt-2">
            <Link to={notificationsTo} className={`inline-flex text-xs font-medium ${linkTone}`}>
              前往通知中心 →
            </Link>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs opacity-60 hover:opacity-100">
        关闭
      </button>
    </div>
  );
}
