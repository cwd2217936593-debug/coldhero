import { api } from "@/api/client";
import type { ApiResp, NotificationItem } from "@/api/types";

export async function listNotifications(unreadOnly = false): Promise<NotificationItem[]> {
  const r = await api.get<ApiResp<NotificationItem[]>>("/notifications", {
    params: { unreadOnly },
  });
  return r.data.data;
}

export async function unreadCount(): Promise<number> {
  const r = await api.get<ApiResp<{ count: number }>>("/notifications/unread-count");
  return r.data.data.count;
}

export async function markRead(ids: number[]): Promise<void> {
  await api.post("/notifications/mark-read", { ids });
}

export async function markAllRead(): Promise<void> {
  await api.post("/notifications/mark-all-read");
}
