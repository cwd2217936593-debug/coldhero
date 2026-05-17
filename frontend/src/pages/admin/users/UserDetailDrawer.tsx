/**
 * 用户详情侧栏：`GET /api/admin/users/:id`
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import { adminApi, type AdminUserDetailPayload } from "@/api/admin";
import { errMessage } from "@/api/client";

const LEVEL_BADGE: Record<string, string> = {
  free: "bg-slate-200 text-slate-800",
  basic: "bg-sky-100 text-sky-900",
  professional: "bg-violet-100 text-violet-900",
  enterprise: "bg-amber-100 text-amber-950",
};

export default function UserDetailDrawer({
  open,
  userId,
  onClose,
}: {
  open: boolean;
  userId: number | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || userId == null) {
      setDetail(null);
      return;
    }
    let live = true;
    setLoading(true);
    setErr(null);
    void adminApi
      .getUser(userId)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setErr(errMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, userId]);

  if (!open || userId == null) return null;

  const u = detail?.user;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="关闭" onClick={onClose} />
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div id="user-detail-title" className="text-sm font-semibold text-slate-900">
              账号详情
            </div>
            {u ? (
              <div className="mt-0.5 text-xs text-slate-500">
                ID {u.id} · {u.username}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {loading ? <div className="text-slate-500">加载中…</div> : null}
          {err ? <div className="text-rose-600">{err}</div> : null}
          {!loading && !err && u ? (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">资料</h3>
                <dl className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-1 text-xs">
                  <dt className="text-slate-500">显示名</dt>
                  <dd className="text-slate-900">{u.displayName ?? "—"}</dd>
                  <dt className="text-slate-500">手机</dt>
                  <dd className="text-slate-900">{u.phone ?? "—"}</dd>
                  <dt className="text-slate-500">邮箱</dt>
                  <dd className="break-all text-slate-900">{u.email || "—"}</dd>
                  <dt className="text-slate-500">角色</dt>
                  <dd className="text-slate-900">{u.role}</dd>
                  <dt className="text-slate-500">区域</dt>
                  <dd className="text-slate-900">{u.regionName ?? (u.regionId != null ? `ID ${u.regionId}` : "—")}</dd>
                  <dt className="text-slate-500">状态</dt>
                  <dd className="text-slate-900">{u.status === "active" ? "正常" : "禁用"}</dd>
                  <dt className="text-slate-500">创建</dt>
                  <dd className="text-slate-900">{u.createdAt}</dd>
                  <dt className="text-slate-500">创建人</dt>
                  <dd className="text-slate-900">{u.createdByName ?? "—"}</dd>
                  <dt className="text-slate-500">最近登录</dt>
                  <dd className="text-slate-900">{u.lastLoginAt ?? "—"}</dd>
                </dl>
              </section>

              {u.role === "customer" ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">会员</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={clsx(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        LEVEL_BADGE[u.memberLevel] ?? "bg-slate-100",
                      )}
                    >
                      {u.memberLevelLabel ?? u.memberLevel}
                    </span>
                    <span className="text-xs text-slate-600">
                      冷库上限 {u.zoneLimit < 0 ? "不限" : u.zoneLimit} · 到期 {u.memberExpireAt ?? "未设置"}
                    </span>
                  </div>
                  {u.notes ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{u.notes}</p>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  绑定冷库（{detail!.boundZones.length}）
                </h3>
                {detail!.boundZones.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无绑定</p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {detail!.boundZones.map((z) => (
                      <li key={z.id} className="flex justify-between gap-2 border-b border-slate-50 py-1">
                        <span className="text-slate-800">{z.name}</span>
                        <span className="shrink-0 text-slate-500">
                          {z.code} · {z.isOnline ? "在线" : "离线"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">等级变更（最近 8 条）</h3>
                {detail!.levelLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无记录</p>
                ) : (
                  <ul className="space-y-2 text-xs text-slate-700">
                    {detail!.levelLogs.slice(0, 8).map((l) => (
                      <li key={l.id} className="rounded border border-slate-100 px-2 py-1.5">
                        <div className="font-medium">
                          {l.fromLevel} → {l.toLevel}
                        </div>
                        <div className="mt-0.5 text-slate-500">
                          {l.createdAt}
                          {l.reason ? ` · ${l.reason}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
