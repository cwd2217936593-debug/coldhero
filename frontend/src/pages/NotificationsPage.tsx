import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import { listNotifications, markAllRead, markRead } from "@/api/notifications";
import type { NotificationItem } from "@/api/types";

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  alert:  { label: "告警", color: "bg-rose-100 text-rose-700" },
  fault:  { label: "故障", color: "bg-amber-100 text-amber-700" },
  system: { label: "系统", color: "bg-slate-100 text-slate-700" },
  report: { label: "报告", color: "bg-emerald-100 text-emerald-700" },
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = useCallback(async () => {
    const list = await listNotifications(unreadOnly);
    setItems(list);
  }, [unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markOne(id: number) {
    await markRead([id]);
    await load();
  }
  async function markAll() {
    await markAllRead();
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900 mr-auto">通知中心</h1>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          仅未读
        </label>
        <button
          onClick={markAll}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100"
        >
          全部已读
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {items.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">暂无通知</div>
        )}
        {items.map((n) => {
          const t = TYPE_LABEL[n.type] ?? TYPE_LABEL.system;
          return (
            <div key={n.id} className={clsx("p-4 flex gap-3 items-start", !n.isRead && "bg-brand-50/40")}>
              <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0", t.color)}>{t.label}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 text-sm">{n.title}</div>
                {n.content && <div className="mt-0.5 text-xs text-slate-500 leading-relaxed">{n.content}</div>}
                <div className="mt-1 text-[10.5px] text-slate-400">{dayjs(n.createdAt).format("YYYY-MM-DD HH:mm:ss")}</div>
              </div>
              {!n.isRead && (
                <button
                  onClick={() => markOne(n.id)}
                  className="text-[11px] text-brand-600 hover:underline shrink-0"
                >
                  标为已读
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
