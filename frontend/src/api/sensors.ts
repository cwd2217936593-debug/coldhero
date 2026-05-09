import { api } from "@/api/client";
import type { ApiResp, CompareResp, HistoryResp, SensorPoint, Zone, ZoneSnapshot } from "@/api/types";

export async function listZones(): Promise<Zone[]> {
  const r = await api.get<ApiResp<Zone[]>>("/zones");
  return r.data.data;
}

export async function listZoneSnapshots(): Promise<ZoneSnapshot[]> {
  const r = await api.get<ApiResp<ZoneSnapshot[]>>("/sensors/zones");
  return r.data.data;
}

export async function getZoneSeries(
  zoneId: number,
  opts: { window?: string; from?: string; to?: string } = {},
): Promise<{ from: string; to: string; points: SensorPoint[]; zone: Zone }> {
  const r = await api.get<ApiResp<{ from: string; to: string; points: SensorPoint[]; zone: Zone }>>(
    `/sensors/zones/${zoneId}/series`,
    { params: opts },
  );
  return r.data.data;
}

export async function getZoneHistory(
  zoneId: number,
  opts: { from?: string; to?: string; bucket?: string } = {},
): Promise<HistoryResp> {
  const r = await api.get<ApiResp<HistoryResp>>(`/sensors/zones/${zoneId}/history`, {
    params: opts,
  });
  return r.data.data;
}

export async function getZoneCompare(
  zoneId: number,
  opts: { from?: string; to?: string } = {},
): Promise<CompareResp> {
  const r = await api.get<ApiResp<CompareResp>>(`/sensors/zones/${zoneId}/compare`, {
    params: opts,
  });
  return r.data.data;
}
