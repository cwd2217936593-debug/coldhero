import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { adminApi } from "@/api/admin";
import { adminShellSectionTitle } from "./adminNavConfig";

/**
 * 顶栏 / document.title 用的版块标题。
 * Step 11：设备监控下钻 `/admin/monitor/:zoneId` 时拉取 realtime 展示 `code · name`（与库区详情页数据源一致）。
 */
export function useAdminShellTitle(): string {
  const location = useLocation();
  const [monitorZoneLine, setMonitorZoneLine] = useState<string | null>(null);

  useEffect(() => {
    setMonitorZoneLine(null);
    const m = location.pathname.match(/^\/admin\/monitor\/(\d+)$/);
    if (!m) return;
    const zoneId = Number(m[1]);
    let live = true;
    void adminApi
      .zoneRealtime(zoneId)
      .then((d) => {
        if (!live) return;
        setMonitorZoneLine(`${d.zone.code} · ${d.zone.name}`);
      })
      .catch(() => {
        if (!live) return;
        setMonitorZoneLine(null);
      });
    return () => {
      live = false;
    };
  }, [location.pathname]);

  return useMemo(() => {
    if (monitorZoneLine && /^\/admin\/monitor\/\d+$/.test(location.pathname)) {
      return `设备监控 · ${monitorZoneLine}`;
    }
    return adminShellSectionTitle(location.pathname);
  }, [location.pathname, monitorZoneLine]);
}
