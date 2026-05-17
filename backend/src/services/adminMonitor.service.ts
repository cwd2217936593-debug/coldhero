/**
 * 管理员端设备监控查询服务（提示词 Step 6 / 11）
 * --------------------------------
 * 路由：`routes/admin/monitor.ts` → `/api/admin/monitor/*`
 * 告警阈值统一读 `env.TEMP_ALERT_MIN` / `TEMP_ALERT_MAX` / `HUMIDITY_ALERT_MAX`。
 * `zoneRealtime` 返回 `customerName` 供管理端详情面包屑（Step 11）。
 */

import { env } from "@/config/env";
import type { ZoneRow } from "@/modules/zones/zones.repository";
import { zonesRepo } from "@/modules/zones/zones.repository";
import type { SensorRow } from "@/modules/sensors/sensors.repository";
import { sensorsRepo } from "@/modules/sensors/sensors.repository";
import { usersRepo, type UserRow } from "@/modules/users/users.repository";
import { regionsRepo } from "@/modules/regions/regions.repository";

export function zoneIsAlerting(
  zone: Pick<ZoneRow, "is_online">,
  latest: Pick<SensorRow, "temperature" | "humidity"> | null,
  tMin = env.TEMP_ALERT_MIN,
  tMax = env.TEMP_ALERT_MAX,
  hMax = env.HUMIDITY_ALERT_MAX,
): boolean {
  if (zone.is_online !== 1) return true;
  if (!latest) return false;
  const t = latest.temperature !== null ? Number(latest.temperature) : null;
  const h = latest.humidity !== null ? Number(latest.humidity) : null;
  if (t !== null && (t < tMin || t > tMax)) return true;
  if (h !== null && h > hMax) return true;
  return false;
}

export type CustomerAggregateStatus = "online" | "offline" | "alert";

function aggregateCustomerStatus(
  zones: ZoneRow[],
  latestMap: Map<number, SensorRow>,
): CustomerAggregateStatus {
  if (!zones.length) return "offline";
  let anyOffline = false;
  let anyAlert = false;
  for (const z of zones) {
    const l = latestMap.get(z.id) ?? null;
    const alert = zoneIsAlerting(z, l);
    if (alert) anyAlert = true;
    if (z.is_online !== 1) anyOffline = true;
  }
  if (anyAlert) return "alert";
  if (anyOffline) return "offline";
  return "online";
}

export const adminMonitorService = {
  async overview(): Promise<{
    totalZones: number;
    onlineCount: number;
    offlineCount: number;
    alertCount: number;
  }> {
    const zones = await zonesRepo.list();
    const latest = await sensorsRepo.latestPerZone();
    const latestMap = new Map(latest.map((s) => [s.zone_id, s]));
    let onlineCount = 0;
    let offlineCount = 0;
    let alertCount = 0;
    for (const z of zones) {
      const l = latestMap.get(z.id) ?? null;
      if (z.is_online !== 1) offlineCount++;
      else onlineCount++;
      if (zoneIsAlerting(z, l)) alertCount++;
    }
    return {
      totalZones: zones.length,
      onlineCount,
      offlineCount,
      alertCount,
    };
  },

  async listCustomers(opts: {
    regionId?: number;
    status?: CustomerAggregateStatus;
    keyword?: string;
    page: number;
    size: number;
  }): Promise<{
    items: Array<{
      id: number;
      name: string;
      zoneCount: number;
      region: string | null;
      memberExpireAt: string | null;
      onlineStatus: CustomerAggregateStatus;
      alertCount: number;
    }>;
    total: number;
  }> {
    const { items: users, total: _dbTotal } = await usersRepo.listForAdmin({
      role: "viewer",
      keyword: opts.keyword,
      regionId: opts.regionId,
      page: 1,
      size: 3000,
    });

    const zones = await zonesRepo.list();
    const byCustomer = new Map<number, ZoneRow[]>();
    for (const z of zones) {
      if (!z.customer_id) continue;
      const arr = byCustomer.get(z.customer_id) ?? [];
      arr.push(z);
      byCustomer.set(z.customer_id, arr);
    }

    const latest = await sensorsRepo.latestPerZone();
    const latestMap = new Map(latest.map((s) => [s.zone_id, s]));

    const regionCache = new Map<number, string | null>();

    async function regionName(id: number | null): Promise<string | null> {
      if (id === null) return null;
      if (regionCache.has(id)) return regionCache.get(id) ?? null;
      const r = await regionsRepo.findById(id);
      const n = r?.name ?? null;
      regionCache.set(id, n);
      return n;
    }

    const out: Array<{
      id: number;
      name: string;
      zoneCount: number;
      region: string | null;
      memberExpireAt: string | null;
      onlineStatus: CustomerAggregateStatus;
      alertCount: number;
    }> = [];

    for (const u of users) {
      const zs = byCustomer.get(u.id) ?? [];
      const st = aggregateCustomerStatus(zs, latestMap);
      let alertC = 0;
      for (const z of zs) {
        const l = latestMap.get(z.id) ?? null;
        if (zoneIsAlerting(z, l)) alertC++;
      }
      if (opts.status && st !== opts.status) continue;
      const disp = u.display_name ?? u.username;
      out.push({
        id: u.id,
        name: disp,
        zoneCount: zs.length,
        region: await regionName(u.region_id),
        memberExpireAt: u.member_expire_at
          ? u.member_expire_at.toISOString().slice(0, 10)
          : null,
        onlineStatus: st,
        alertCount: alertC,
      });
    }

    const start = Math.max((opts.page - 1) * opts.size, 0);
    const pageItems = out.slice(start, start + opts.size);
    return { items: pageItems, total: out.length };
  },

  async zonesForCustomer(customerId: number): Promise<
    Array<{
      id: number;
      name: string;
      deviceSn: string | null;
      isOnline: boolean;
      lastSeenAt: string | null;
      latestTemp: number | null;
      latestHumidity: number | null;
      isAlerting: boolean;
    }>
  > {
    const all = await zonesRepo.list();
    const zs = all.filter((z) => z.customer_id === customerId);
    const latest = await sensorsRepo.latestPerZone();
    const latestMap = new Map(latest.map((s) => [s.zone_id, s]));
    return zs.map((z) => {
      const l = latestMap.get(z.id) ?? null;
      return {
        id: z.id,
        name: z.name,
        deviceSn: z.device_sn,
        isOnline: z.is_online === 1,
        lastSeenAt: z.last_seen_at ? z.last_seen_at.toISOString() : null,
        latestTemp: l?.temperature !== null && l?.temperature !== undefined ? Number(l.temperature) : null,
        latestHumidity: l?.humidity !== null && l?.humidity !== undefined ? Number(l.humidity) : null,
        isAlerting: zoneIsAlerting(z, l),
      };
    });
  },

  async zoneRealtime(zoneId: number): Promise<{
    zone: ZoneRow;
    /** 绑定客户展示名（面包屑）；未绑定为 null */
    customerName: string | null;
    temperature: number | null;
    humidity: number | null;
    co2: number | null;
    doorStatus: string;
    currentAmpere: number | null;
    runMinutes: number;
    isOnline: boolean;
    /** 与后端 env 一致，供管理端前端高亮区间 */
    alertThresholds: { tempMin: number; tempMax: number; humidityMax: number };
    trend: Awaited<ReturnType<typeof sensorsRepo.latestSeriesByZone>>;
  } | null> {
    const zone = await zonesRepo.findById(zoneId);
    if (!zone) return null;
    let customerName: string | null = null;
    if (zone.customer_id) {
      const u = await usersRepo.findById(zone.customer_id);
      customerName = u ? u.display_name ?? u.username : null;
    }
    const latest = await sensorsRepo.latestByZone(zoneId);
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);
    const series = await sensorsRepo.latestSeriesByZone(zoneId, from, to, 60);
    return {
      zone,
      customerName,
      temperature: latest?.temperature !== null && latest?.temperature !== undefined ? Number(latest.temperature) : null,
      humidity: latest?.humidity !== null && latest?.humidity !== undefined ? Number(latest.humidity) : null,
      co2: latest?.co2 !== null && latest?.co2 !== undefined ? Number(latest.co2) : null,
      doorStatus: latest?.door_status ?? "unknown",
      currentAmpere: zone.current_ampere !== null ? Number(zone.current_ampere) : null,
      runMinutes: zone.run_minutes,
      isOnline: zone.is_online === 1,
      alertThresholds: {
        tempMin: env.TEMP_ALERT_MIN,
        tempMax: env.TEMP_ALERT_MAX,
        humidityMax: env.HUMIDITY_ALERT_MAX,
      },
      trend: series,
    };
  },

  async alerts(): Promise<
    Array<{
      zoneId: number;
      zoneName: string;
      customerId: number | null;
      customerName: string | null;
      reason: "offline" | "temperature" | "humidity";
      isOnline: boolean;
      latestTemp: number | null;
      latestHumidity: number | null;
    }>
  > {
    const zones = await zonesRepo.list();
    const latest = await sensorsRepo.latestPerZone();
    const latestMap = new Map(latest.map((s) => [s.zone_id, s]));
    const out: Array<{
      zoneId: number;
      zoneName: string;
      customerId: number | null;
      customerName: string | null;
      reason: "offline" | "temperature" | "humidity";
      isOnline: boolean;
      latestTemp: number | null;
      latestHumidity: number | null;
    }> = [];

    async function custName(uid: number | null): Promise<string | null> {
      if (!uid) return null;
      const u = await usersRepo.findById(uid);
      return u ? u.display_name ?? u.username : null;
    }

    for (const z of zones) {
      const l = latestMap.get(z.id) ?? null;
      if (!zoneIsAlerting(z, l)) continue;
      let reason: "offline" | "temperature" | "humidity" = "offline";
      if (z.is_online !== 1) reason = "offline";
      else {
        const t = l?.temperature !== null && l?.temperature !== undefined ? Number(l.temperature) : null;
        const h = l?.humidity !== null && l?.humidity !== undefined ? Number(l.humidity) : null;
        if (t !== null && (t < env.TEMP_ALERT_MIN || t > env.TEMP_ALERT_MAX)) reason = "temperature";
        else if (h !== null && h > env.HUMIDITY_ALERT_MAX) reason = "humidity";
      }
      out.push({
        zoneId: z.id,
        zoneName: z.name,
        customerId: z.customer_id,
        customerName: await custName(z.customer_id),
        reason,
        isOnline: z.is_online === 1,
        latestTemp: l?.temperature !== null && l?.temperature !== undefined ? Number(l.temperature) : null,
        latestHumidity: l?.humidity !== null && l?.humidity !== undefined ? Number(l.humidity) : null,
      });
    }
    return out;
  },
};

export function displayUserName(row: UserRow | null): string {
  if (!row) return "";
  return row.display_name ?? row.username;
}
