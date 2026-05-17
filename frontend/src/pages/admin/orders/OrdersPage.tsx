/**
 * 工单列表、手动建单、派单与驳回（提示词 Step 7：`/admin/orders*`；本页编排为 Step 12）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { adminApi } from "@/api/admin";
import { listFaultReports } from "@/api/fault";
import type { FaultReport } from "@/api/types";
import { errMessage } from "@/api/client";
import StatusBadge from "@/pages/admin/shared/StatusBadge";
import OrderDrawer, { type AdminOrderRow, ORDER_STATUS_LABEL } from "@/pages/admin/orders/OrderDrawer";

const TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "active", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "closed", label: "已关闭" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function matchTab(tab: TabKey, status: string): boolean {
  if (tab === "all") return true;
  if (tab === "pending") return status === "pending";
  if (tab === "active") return ["assigned", "arrived", "in_progress"].includes(status);
  if (tab === "done") return status === "done";
  if (tab === "closed") return status === "closed";
  return true;
}

function toIso(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toIsoNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

export default function OrdersPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [items, setItems] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<AdminOrderRow | null>(null);
  const [techs, setTechs] = useState<Array<{ id: number; name: string; isBusy: boolean }>>([]);
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [techPick, setTechPick] = useState<number | "">("");
  const [msg, setMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [faults, setFaults] = useState<FaultReport[]>([]);
  const [createFaultId, setCreateFaultId] = useState<number | "">("");
  const [createTechId, setCreateTechId] = useState<number | "">("");
  const [createNote, setCreateNote] = useState("");
  const [creating, setCreating] = useState(false);

  const tabVisibleRef = useRef(true);
  const blockingModalRef = useRef(false);

  useEffect(() => {
    blockingModalRef.current = createOpen || assignFor !== null;
  }, [createOpen, assignFor]);

  useEffect(() => {
    const sync = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) {
      setLoading(true);
      setMsg(null);
    }
    try {
      const data = await adminApi.orders({ page: 1, size: 200 });
      const list = data.items.map((i) => ({
        ...i,
        createdAt: toIso(i.createdAt),
        arrivalTime: toIsoNull(i.arrivalTime),
        completeTime: toIsoNull(i.completeTime),
        updatedAt: toIso(i.updatedAt),
      })) as AdminOrderRow[];
      setItems(list);
      const t = await adminApi.orderTechnicians();
      setTechs(t);
      if (!silent) setMsg(null);
    } catch (e) {
      if (!silent) setMsg(errMessage(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (!tabVisibleRef.current || blockingModalRef.current) return;
      void load({ silent: true });
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    setDrawer((d) => {
      if (!d) return d;
      return items.find((i) => i.id === d.id) ?? d;
    });
  }, [items]);

  const filtered = useMemo(
    () => items.filter((i) => matchTab(tab, i.status)),
    [items, tab],
  );

  useEffect(() => {
    if (!createOpen) return;
    void listFaultReports({ page: 1, pageSize: 100 })
      .then((r) => setFaults(r.items))
      .catch(() => setFaults([]));
  }, [createOpen]);

  async function onReject(o: AdminOrderRow) {
    if (!confirm(`驳回工单 #${o.id}？客户将收到站内信通知。`)) return;
    try {
      await adminApi.rejectOrder(o.id);
      await load();
      setDrawer(null);
    } catch (e) {
      setMsg(errMessage(e));
    }
  }

  async function onCloseOrder(o: AdminOrderRow) {
    if (!confirm(`关闭工单 #${o.id}？`)) return;
    try {
      await adminApi.patchOrder(o.id, { status: "closed" });
      await load();
      setDrawer(null);
    } catch (e) {
      setMsg(errMessage(e));
    }
  }

  async function submitCreate() {
    if (createFaultId === "") {
      setMsg("请选择关联故障");
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      await adminApi.createOrder({
        faultId: Number(createFaultId),
        ...(createTechId !== "" ? { assignedTo: Number(createTechId) } : {}),
        ...(createNote.trim() ? { note: createNote.trim() } : {}),
      });
      setCreateOpen(false);
      setCreateFaultId("");
      setCreateTechId("");
      setCreateNote("");
      await load();
    } catch (e) {
      setMsg(errMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">工单管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            约每 30s 静默同步工单与维修工忙碌状态；弹窗打开或标签页在后台时暂停。派单若返回 409，表示该维修工已被占用，请换人。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
          >
            刷新列表
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            onClick={() => {
              setMsg(null);
              setCreateOpen(true);
            }}
          >
            手动创建工单
          </button>
        </div>
      </div>
      {msg ? <div className="text-sm text-rose-600">{msg}</div> : null}

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={clsx(
              "border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-slate-900 font-medium text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-slate-500">加载中…</div> : null}

      <div className="grid gap-3">
        {filtered.map((o) => (
          <div
            key={o.id}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300"
            onClick={() => setDrawer(o)}
            onKeyDown={(e) => e.key === "Enter" && setDrawer(o)}
            role="button"
            tabIndex={0}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm text-slate-900">
                {o.autoAssigned ? (
                  <span className="mr-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">
                    自动
                  </span>
                ) : (
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    手动
                  </span>
                )}
                <span className="font-medium">
                  {o.customerName ?? "客户"} · {o.zoneName ?? "—"}
                </span>
              </div>
              <StatusBadge kind={o.status}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {o.faultType} · {o.faultTitle.length > 50 ? `${o.faultTitle.slice(0, 50)}…` : o.faultTitle}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              <span>维修：{o.technicianName ?? "待分配"}</span>
              <span>创建：{fmt(o.createdAt)}</span>
              {o.completeTime ? <span>完成：{fmt(o.completeTime)}</span> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {o.status === "pending" && (
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => {
                    setAssignFor(o.id);
                    setTechPick("");
                  }}
                >
                  派单
                </button>
              )}
              {(o.status === "assigned" ||
                o.status === "arrived" ||
                o.status === "in_progress") && (
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => setDrawer(o)}
                >
                  查看详情
                </button>
              )}
              {o.status === "done" && (
                <>
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                    onClick={() => setDrawer(o)}
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                    onClick={() => void onCloseOrder(o)}
                  >
                    关闭
                  </button>
                </>
              )}
              {o.status !== "rejected" && o.status !== "closed" && (
                <button
                  type="button"
                  className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                  onClick={() => void onReject(o)}
                >
                  驳回
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">手动创建工单</div>
            <p className="mt-1 text-xs text-slate-500">选择已有故障报告；可选立即指派维修人员（留空则待派单）。</p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-500">关联故障</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={createFaultId}
                  onChange={(e) => setCreateFaultId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">请选择故障</option>
                  {faults.map((f) => (
                    <option key={f.id} value={f.id}>
                      #{f.id} · {f.title.slice(0, 48)}
                      {f.title.length > 48 ? "…" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">指派维修人员（可选）</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={createTechId}
                  onChange={(e) => setCreateTechId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">暂不指派（待派单）</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.isBusy}>
                      {t.name}
                      {t.isBusy ? "（忙碌）" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">备注（可选）</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  rows={3}
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  placeholder="工单备注…"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={creating}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => void submitCreate()}
              >
                {creating ? "提交中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignFor !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <div className="text-sm font-medium">选择维修人员</div>
            <p className="mt-1 text-xs text-slate-500">
              若确认后提示冲突（409），说明该维修工已被其他工单占用，请取消后选择其他人员。
            </p>
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={techPick}
              onChange={(e) => setTechPick(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">请选择</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id} disabled={t.isBusy}>
                  {t.name}
                  {t.isBusy ? "（忙碌）" : ""}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => setAssignFor(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
                onClick={async () => {
                  if (techPick === "") return;
                  try {
                    await adminApi.assignOrder(assignFor, techPick);
                    setAssignFor(null);
                    await load();
                  } catch (e) {
                    setMsg(errMessage(e));
                  }
                }}
              >
                确认派单
              </button>
            </div>
          </div>
        </div>
      )}

      <OrderDrawer
        order={drawer}
        open={!!drawer}
        onClose={() => setDrawer(null)}
        onSaved={() => void load({ silent: true })}
      />
    </div>
  );
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}
