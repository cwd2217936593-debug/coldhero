/**
 * 客户冷库绑定：覆盖式同步 `bind-zones`，与列表页筛选勾选交互一致。
 */

import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/api/admin";
import { listZones } from "@/api/sensors";
import { errMessage } from "@/api/client";
import type { Zone } from "@/api/types";

export default function ZoneBindModal({
  userId,
  username,
  onClose,
  onSaved,
}: {
  userId: number;
  username: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    void Promise.all([
      listZones()
        .then((z) => live && setZones(z))
        .catch(() => live && setZones([])),
      adminApi
        .getUserZones(userId)
        .then((rows) => live && setPicked(new Set(rows.map((r) => r.id))))
        .catch(() => live && setPicked(new Set())),
    ]).finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q));
  }, [zones, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bind-zones-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="bind-zones-title" className="text-sm font-semibold">
          绑定冷库 · {username}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          勾选后保存将<strong className="text-slate-700">覆盖式</strong>写入这些库区的归属客户。可按编码或名称筛选。
        </p>
        {err ? <div className="mt-2 text-sm text-rose-600">{err}</div> : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-[14rem]"
            placeholder="筛选库区编码 / 名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              disabled={loading || filtered.length === 0}
              className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
              onClick={() =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  for (const z of filtered) n.add(z.id);
                  return n;
                })
              }
            >
              全选当前筛选
            </button>
            <button
              type="button"
              disabled={loading || filtered.length === 0}
              className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
              onClick={() =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  for (const z of filtered) n.delete(z.id);
                  return n;
                })
              }
            >
              取消当前筛选勾选
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          已选 <span className="font-medium text-slate-800">{picked.size}</span> / {zones.length} 个库区
          {query.trim() ? ` · 筛选显示 ${filtered.length} 条` : null}
          {loading ? <span className="text-slate-400"> · 载入中…</span> : null}
        </div>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
          {filtered.map((z) => (
            <li key={z.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={picked.has(z.id)}
                onChange={(e) => {
                  const n = new Set(picked);
                  if (e.target.checked) n.add(z.id);
                  else n.delete(z.id);
                  setPicked(n);
                }}
              />
              <span className="text-slate-800">{z.name}</span>
              <span className="text-slate-500">({z.code})</span>
            </li>
          ))}
          {!loading && filtered.length === 0 ? (
            <li className="py-8 text-center text-slate-400">
              {zones.length === 0 ? "暂无可指派库区列表" : "无匹配库区，换个关键词"}
            </li>
          ) : null}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-4 py-2" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            disabled={loading || busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await adminApi.syncCustomerZones(userId, [...picked]);
                await onSaved();
                onClose();
              } catch (e) {
                setErr(errMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
