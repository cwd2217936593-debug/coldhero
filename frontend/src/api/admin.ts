/**
 * 管理员后台 API（/api/admin/*）
 */

import { api } from "@/api/client";
import type { ApiResp, MemberLevel } from "@/api/types";

function unwrap<T>(r: { data: ApiResp<T> }, action: string): T {
  const body = r.data;
  if (!body?.success) throw new Error(body?.message ?? `${action}失败`);
  return body.data as T;
}

/** 返回顶层 `warning`（改等级 / 禁用等业务提示） */
function unwrapWithWarn<T>(r: { data: ApiResp<T> }, action: string): { data: T; warning?: string } {
  const body = r.data;
  if (!body?.success) throw new Error(body?.message ?? `${action}失败`);
  return { data: body.data as T, warning: body.warning };
}

export type AdminCustomerStatus = "online" | "offline" | "alert";

export type ZoneRealtimePayload = {
  zone: {
    id: number;
    customer_id: number | null;
    code: string;
    name: string;
    device_sn: string | null;
    run_minutes: number;
    is_online: number;
  };
  customerName: string | null;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  doorStatus: string;
  currentAmpere: number | null;
  runMinutes: number;
  isOnline: boolean;
  alertThresholds: { tempMin: number; tempMax: number; humidityMax: number };
  trend: Array<{
    id: number;
    zone_id: number;
    temperature: unknown;
    humidity: unknown;
    co2: unknown;
    door_status: string;
    is_anomaly: number;
    recorded_at: string;
  }>;
};

export type AdminUserRow = {
  id: number;
  username: string;
  phone: string | null;
  role: string;
  memberLevel: string;
  /** 列表接口扩展字段 */
  memberLevelLabel?: string;
  regionId: number | null;
  regionName?: string | null;
  status: string;
  memberExpireAt: string | null;
  bindZoneCount: number;
  displayName: string | null;
  zoneLimit?: number;
  lastLoginAt?: string | null;
  createdAt?: string;
  createdByName?: string | null;
};

export type AdminCreateUserBody = {
  username: string;
  password: string;
  phone: string;
  realName: string;
  email?: string;
  role: "customer" | "technician" | "ops_admin";
  memberLevel?: MemberLevel;
  zoneLimit?: number;
  zoneIds?: number[];
  regionId?: number;
  memberExpireAt?: string;
  notes?: string;
};

export type AdminCreateUserResult = {
  id: number;
  userId: number;
  username: string;
  role: string;
  memberLevel: string;
  boundZones: number;
  tempPassword: string;
};

export type AdminUserDetailPayload = {
  user: {
    id: number;
    username: string;
    email: string;
    phone: string | null;
    displayName: string | null;
    role: string;
    memberLevel: string;
    memberLevelLabel: string;
    regionId: number | null;
    regionName: string | null;
    status: string;
    memberExpireAt: string | null;
    zoneLimit: number;
    notes: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    createdByName: string | null;
  };
  boundZones: Array<{ id: number; code: string; name: string; isOnline: boolean }>;
  levelLogs: Array<{
    id: number;
    fromLevel: string;
    toLevel: string;
    changedBy: number;
    reason: string | null;
    createdAt: string;
  }>;
  quotas: { aiChat: unknown; report: unknown };
};

export type AdminZoneAvailableRow = {
  id: number;
  code: string;
  name: string;
  deviceSn: string | null;
  isOnline: boolean;
  customerId: number | null;
};

export const adminApi = {
  async monitorOverview() {
    const r = await api.get<
      ApiResp<{ totalZones: number; onlineCount: number; offlineCount: number; alertCount: number }>
    >("/admin/monitor/overview");
    return unwrap(r, "监控概览");
  },

  async monitorCustomers(params: {
    region_id?: number;
    status?: AdminCustomerStatus;
    keyword?: string;
    page?: number;
    size?: number;
  }) {
    const r = await api.get<
      ApiResp<{
        items: Array<{
          id: number;
          name: string;
          zoneCount: number;
          region: string | null;
          memberExpireAt: string | null;
          onlineStatus: AdminCustomerStatus;
          alertCount: number;
        }>;
        total: number;
      }>
    >("/admin/monitor/customers", { params });
    return unwrap(r, "客户列表");
  },

  async monitorCustomerZones(customerId: number) {
    const r = await api.get<
      ApiResp<
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
      >
    >(`/admin/monitor/customers/${customerId}/zones`);
    return unwrap(r, "客户冷库");
  },

  async zoneRealtime(zoneId: number) {
    const r = await api.get<ApiResp<ZoneRealtimePayload>>(`/admin/monitor/zones/${zoneId}/realtime`);
    return unwrap(r, "实时数据");
  },

  async alerts() {
    const r = await api.get<ApiResp<unknown[]>>("/admin/monitor/alerts");
    return unwrap(r, "告警列表");
  },

  async regions() {
    const r = await api.get<ApiResp<Array<{ id: number; name: string; description: string | null; createdAt: string }>>>(
      "/admin/regions",
    );
    return unwrap(r, "区域");
  },

  async createRegion(body: { name: string; description?: string }) {
    const r = await api.post<ApiResp<{ id: number }>>("/admin/regions", body);
    return unwrap(r, "创建区域");
  },

  async patchRegion(id: number, body: { name?: string; description?: string | null }) {
    const r = await api.patch<ApiResp<null>>(`/admin/regions/${id}`, body);
    return unwrap(r, "更新区域");
  },

  async orders(params: { status?: string; page?: number; size?: number }) {
    const r = await api.get<
      ApiResp<{
        items: Array<{
          id: number;
          faultId: number;
          assignedTo: number | null;
          status: string;
          autoAssigned: boolean;
          faultTitle: string;
          faultType: string;
          zoneName: string | null;
          customerName: string | null;
          technicianName: string | null;
          createdAt: string;
          /** 可能为 ISO 字符串或后端序列化格式 */
          arrivalTime: string | null;
          completeTime: string | null;
          resultNote: string | null;
          updatedAt: string;
        }>;
        total: number;
      }>
    >("/admin/orders", { params });
    return unwrap(r, "工单");
  },

  async createOrder(body: { faultId: number; assignedTo?: number; note?: string }) {
    const r = await api.post<ApiResp<{ id: number }>>("/admin/orders", body);
    return unwrap(r, "创建工单");
  },

  async orderTechnicians() {
    const r = await api.get<ApiResp<Array<{ id: number; name: string; isBusy: boolean }>>>(
      "/admin/orders/technicians",
    );
    return unwrap(r, "维修人员");
  },

  async assignOrder(orderId: number, technicianId: number) {
    const r = await api.post<ApiResp<unknown>>(`/admin/orders/${orderId}/assign`, { technicianId });
    return unwrap(r, "派单");
  },

  async rejectOrder(orderId: number) {
    const r = await api.delete<ApiResp<null>>(`/admin/orders/${orderId}`);
    return unwrap(r, "驳回");
  },

  async patchOrder(
    orderId: number,
    body: {
      status?: string;
      resultNote?: string;
      arrivalTime?: string;
      completeTime?: string;
    },
  ) {
    const r = await api.patch<ApiResp<unknown>>(`/admin/orders/${orderId}`, body);
    return unwrap(r, "更新工单");
  },

  async users(params: {
    role?: string;
    keyword?: string;
    regionId?: number;
    region_id?: number;
    memberLevel?: MemberLevel;
    status?: "active" | "disabled" | "all";
    /** 查询即将到期客户 */
    expiringSoon?: boolean;
    page?: number;
    size?: number;
  }) {
    const { expiringSoon, ...rest } = params;
    const r = await api.get<ApiResp<{ items: AdminUserRow[]; total: number; page: number; size: number }>>(
      "/admin/users",
      {
        params: {
          ...rest,
          ...(expiringSoon ? { expiringSoon: "true" } : {}),
        },
      },
    );
    return unwrap(r, "用户列表");
  },

  async createUser(body: AdminCreateUserBody) {
    const r = await api.post<ApiResp<AdminCreateUserResult>>("/admin/users", body);
    return unwrap(r, "创建用户");
  },

  async getUser(id: number) {
    const r = await api.get<ApiResp<AdminUserDetailPayload>>(`/admin/users/${id}`);
    return unwrap(r, "用户详情");
  },

  async getUserZones(id: number) {
    const r = await api.get<
      ApiResp<Array<{ id: number; code: string; name: string; isOnline: boolean }>>
    >(`/admin/users/${id}/zones`);
    return unwrap(r, "已绑定冷库");
  },

  async listUserZonesAvailable(id: number, params?: { keyword?: string }) {
    const r = await api.get<ApiResp<AdminZoneAvailableRow[]>>(`/admin/users/${id}/zones/available`, {
      params,
    });
    return unwrap(r, "可绑定冷库");
  },

  /** 增量绑定（不发起的库区不受影响） */
  async appendUserZones(userId: number, zoneIds: number[]) {
    const r = await api.post<ApiResp<null>>(`/admin/users/${userId}/zones`, { zoneIds });
    return unwrap(r, "绑定冷库");
  },

  async unbindUserZone(userId: number, zoneId: number) {
    const r = await api.delete<ApiResp<null>>(`/admin/users/${userId}/zones/${zoneId}`);
    return unwrap(r, "解绑冷库");
  },

  async updateUserLevel(
    userId: number,
    body: { memberLevel: MemberLevel; zoneLimit?: number; reason?: string },
  ) {
    const r = await api.patch<ApiResp<unknown>>(`/admin/users/${userId}/level`, body);
    return unwrapWithWarn(r, "更新等级");
  },

  async getUserLevelLogs(userId: number) {
    const r = await api.get<
      ApiResp<
        Array<{
          id: number;
          fromLevel: string;
          toLevel: string;
          changedBy: number;
          reason: string | null;
          createdAt: string;
        }>
      >
    >(`/admin/users/${userId}/level-logs`);
    return unwrap(r, "等级变更记录");
  },

  async patchUser(id: number, body: Record<string, unknown>) {
    const r = await api.patch<ApiResp<unknown>>(`/admin/users/${id}`, body);
    return unwrapWithWarn(r, "更新用户");
  },

  async deleteUser(id: number) {
    const r = await api.delete<ApiResp<{ userId: number; status: "disabled" }>>(`/admin/users/${id}`);
    return unwrapWithWarn(r, "禁用用户");
  },

  /** 覆盖式同步冷库归属（zones.customer_id） */
  async syncCustomerZones(userId: number, zoneIds: number[]) {
    const r = await api.post<ApiResp<null>>(`/admin/users/${userId}/bind-zones`, { zoneIds });
    return unwrap(r, "绑定冷库");
  },
};
