/**
 * 传感器快照 HTTP 兜底轮询（Step 4）
 * --------------------------------
 * 在 WebSocket 不可用时每隔 intervalMs（默认 30s）重新拉快照，避免仪表盘「卡死在最后一帧」。
 * WS 已连接时可传 paused=true 关闭轮询，减轻后端负载。
 */

import { useEffect, useRef } from "react";

export interface SensorSnapshotPollingOptions<T> {
  intervalMs?: number;
  /** true 时不启动定时器（例如 WS 已成功连接） */
  paused?: boolean;
  fetcher: () => Promise<T>;
  onSuccess: (data: T) => void;
}

export function useSensorSnapshotPolling<T>(
  opts: SensorSnapshotPollingOptions<T>,
): void {
  const { intervalMs = 30_000, paused = false, fetcher, onSuccess } = opts;
  const fetchRef = useRef(fetcher);
  const onOkRef = useRef(onSuccess);
  fetchRef.current = fetcher;
  onOkRef.current = onSuccess;

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const tick = () => {
      void fetchRef.current()
        .then((d) => {
          if (!cancelled) onOkRef.current(d);
        })
        .catch(() => {
          /* 静默失败，下一轮继续 */
        });
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paused, intervalMs]);
}
