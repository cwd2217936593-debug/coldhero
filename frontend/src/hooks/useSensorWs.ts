import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import type { SensorPoint } from "@/api/types";

interface SensorWsEvent {
  type: "sensor";
  zoneId: number;
  zoneCode: string;
  data: SensorPoint;
}
interface AlertWsEvent {
  type: "alert";
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  level: "info" | "warning" | "critical";
  reasons: string[];
  data: SensorPoint;
}
type WsEvent = SensorWsEvent | AlertWsEvent | { type: "welcome" | "subscribed" | "pong" };

interface Options {
  onSensor?: (e: SensorWsEvent) => void;
  onAlert?: (e: AlertWsEvent) => void;
  zoneIds?: number[];
  /** WebSocket OPEN/CLOSE（重连间隙会先 false）；用于开启 HTTP 30s 兜底轮询 */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * 维护一条 WebSocket 长连接：
 *  - JWT 走 query string
 *  - 自动重连（指数退避，max 30s）
 *  - 服务端 ping / 前端浏览器自动 pong
 */
export function useSensorWs(opts: Options) {
  const { onSensor, onAlert, zoneIds } = opts;
  const optsRef = useRef({ onSensor, onAlert, onConnectionChange: opts.onConnectionChange });
  optsRef.current = {
    onSensor,
    onAlert,
    onConnectionChange: opts.onConnectionChange,
  };

  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let timer: number | null = null;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}/ws/sensors?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
        optsRef.current.onConnectionChange?.(true);
        if (zoneIds && zoneIds.length) {
          ws?.send(JSON.stringify({ type: "subscribe", zoneIds }));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as WsEvent;
          if (data.type === "sensor") optsRef.current.onSensor?.(data as SensorWsEvent);
          else if (data.type === "alert") optsRef.current.onAlert?.(data as AlertWsEvent);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        optsRef.current.onConnectionChange?.(false);
        if (stopped) return;
        const delay = Math.min(1000 * Math.pow(2, attempt++), 30_000);
        timer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      optsRef.current.onConnectionChange?.(false);
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [token, zoneIds]);
}
