/**
 * 区域字典维护（提示词 Step 8：`GET|POST|PATCH /api/admin/regions`）
 * — 与用户管理中的区域下拉、监控筛选共用数据源；新建/重名将提示「区域名称已存在」
 */

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/api/admin";
import { errMessage } from "@/api/client";

type RegionRow = Awaited<ReturnType<typeof adminApi.regions>>[number];

export default function RegionsPage() {
  const [items, setItems] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: RegionRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const r = await adminApi.regions();
      setItems(r);
    } catch (e) {
      setMsg(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">区域管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            Step 8 字典：与客户账号「区域」、设备监控筛选一致；名称唯一，重复时将返回冲突提示。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
          >
            刷新
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            onClick={() => {
              setMsg(null);
              setModal({ mode: "create" });
            }}
          >
            新建区域
          </button>
        </div>
      </div>
      {msg ? <div className="text-sm text-rose-600">{msg}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">说明</th>
              <th className="px-4 py-2">创建时间</th>
              <th className="w-36 px-4 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  暂无区域，可先新建。
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{row.id}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-2 text-slate-600">{row.description ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => {
                        setMsg(null);
                        setModal({ mode: "edit", row });
                      }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <RegionFormModal
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await load();
            setModal(null);
          }}
          onMsg={setMsg}
        />
      )}
    </div>
  );
}

function RegionFormModal({
  mode,
  row,
  onClose,
  onSaved,
  onMsg,
}: {
  mode: "create" | "edit";
  row?: RegionRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onMsg: (v: string | null) => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [desc, setDesc] = useState(row?.description ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="text-sm font-semibold text-slate-900">
          {mode === "create" ? "新建区域" : `编辑 · ${row?.name ?? ""}`}
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="text-xs text-slate-500">名称 · 必填</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">说明（可选）</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 p-2"
              rows={3}
              maxLength={256}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="区域备注…"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              onMsg(null);
              try {
                if (mode === "create") {
                  await adminApi.createRegion({
                    name: name.trim(),
                    ...(desc.trim() ? { description: desc.trim() } : {}),
                  });
                } else if (row) {
                  await adminApi.patchRegion(row.id, {
                    name: name.trim(),
                    description: desc.trim() === "" ? null : desc.trim(),
                  });
                }
                await onSaved();
              } catch (e) {
                onMsg(errMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
