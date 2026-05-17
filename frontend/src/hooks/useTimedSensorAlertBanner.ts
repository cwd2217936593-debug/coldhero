import { useCallback, useEffect, useRef, useState } from "react";
import type { SensorAlertBannerModel } from "@/components/SensorAlertBanner";

const AUTO_DISMISS_MS = 9000;

type BannerWithTs = SensorAlertBannerModel & { ts: number };

/** 条幅状态 + 统一的自动消失 / 手动关闭（新告警会顶替旧计时器）。 */
export function useTimedSensorAlertBanner() {
  const [alert, setAlert] = useState<BannerWithTs | null>(null);
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAlert(null);
  }, []);

  const show = useCallback((model: SensorAlertBannerModel) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const ts = Date.now();
    setAlert({ ...model, ts });
    timerRef.current = window.setTimeout(() => {
      setAlert((prev) => (prev && prev.ts === ts ? null : prev));
      timerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  return { alert, show, dismiss };
}
