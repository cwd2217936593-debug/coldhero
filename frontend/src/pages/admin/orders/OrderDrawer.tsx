/**
 * 工单详情抽屉（提示词 Step 7：`PATCH /admin/orders/:id` 等；本页编排为 Step 12）
 * — 流程时间线、维修备注、关联故障入口；指派后的「到场→维修→完成」单步 PATCH（Step 12）
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "@/api/admin";
import { errMessage } from "@/api/client";
import StatusBadge from "@/pages/admin/shared/StatusBadge";

export interface AdminOrderRow {
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
  arrivalTime: string | null;
  completeTime: string | null;
  updatedAt: string;
  resultNote: string | null;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待派单",
  assigned: "已派单",
  arrived: "已到场",
  in_progress: "维修中",
  done: "已完成",
  closed: "已关闭",
  rejected: "已驳回",
};

export default function OrderDrawer({
  order,
  open,
  onClose,
  onSaved,
}: {
  order: AdminOrderRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);

  useEffect(() => {
    if (order) setNote(order.resultNote ?? "");
    setFlowErr(null);
    setNoteErr(null);
  }, [order?.id, order?.resultNote]);

  if (!open || !order) return null;

  async function advance(
    oid: number,
    body: { status: string; arrivalTime?: string; completeTime?: string },
  ) {
    setFlowBusy(true);
    setFlowErr(null);
    try {
      await adminApi.patchOrder(oid, body);
      await onSaved();
    } catch (e) {
      setFlowErr(errMessage(e));
    } finally {
      setFlowBusy(false);
    }
  }

  const terminalNote = order.status === "rejected" || order.status === "closed";
  const timeline = buildTimeline(order);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="h-full flex-1 cursor-default" aria-label="关闭" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">工单 #{order.id}</div>
          <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind={order.status}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</StatusBadge>
            {order.autoAssigned ? (
              <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">自动派单</span>
            ) : (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">手动派单</span>
            )}
          </div>
          <div className="mt-3 space-y-1 text-slate-600">
            <div>
              <span className="font-medium text-slate-800">{order.customerName ?? "客户"}</span>
              <span className="text-slate-400"> · </span>
              <span>{order.zoneName ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-500">{order.faultType}</span>
              <span className="text-slate-400"> · </span>
              <span>{order.faultTitle}</span>
            </div>
            <div>维修人员：{order.technicianName ?? "待分配"}</div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <div className="text-xs font-medium text-slate-500">流程时间线</div>
            <ul className="mt-3 space-y-0 border-l border-slate-200 pl-3">
              {timeline.map((step) => (
                <li key={step.key} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-300 ring-2 ring-white" />
                  <div className="text-xs text-slate-500">{step.title}</div>
                  <div className="text-sm text-slate-800">{step.time}</div>
                </li>
              ))}
            </ul>
          </div>

          {order.status === "pending" ? (
            <p className="mt-6 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              当前为<strong>待派单</strong>：请先在列表中「派单」指派维修人员，再在此处推进到场与完工。
            </p>
          ) : null}

          {!terminalNote && ["assigned", "arrived", "in_progress"].includes(order.status) ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="text-xs font-medium text-slate-500">流程推进</div>
              {flowErr ? <div className="mt-2 text-xs text-rose-600">{flowErr}</div> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {order.status === "assigned" ? (
                  <button
                    type="button"
                    disabled={flowBusy}
                    className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                    onClick={() => void advance(order.id, { status: "arrived", arrivalTime: new Date().toISOString() })}
                  >
                    标记到场
                  </button>
                ) : null}
                {order.status === "arrived" ? (
                  <button
                    type="button"
                    disabled={flowBusy}
                    className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                    onClick={() => void advance(order.id, { status: "in_progress" })}
                  >
                    开始维修
                  </button>
                ) : null}
                {order.status === "in_progress" ? (
                  <button
                    type="button"
                    disabled={flowBusy}
                    className="rounded-lg border border-emerald-800 bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800 disabled:opacity-50"
                    onClick={() => void advance(order.id, { status: "done", completeTime: new Date().toISOString() })}
                  >
                    标记维修完成
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">到场与完成时间会按当前浏览器时刻写入服务端（UTC ISO）。</p>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="text-xs font-medium text-slate-500">维修结果说明</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm disabled:bg-slate-50"
              rows={4}
              disabled={terminalNote}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={terminalNote ? "已关闭或已驳回，仅可查看" : "填写维修结果…"}
            />
            {noteErr ? <div className="mt-1 text-xs text-rose-600">{noteErr}</div> : null}
            {!terminalNote ? (
              <button
                type="button"
                disabled={saving}
                className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                onClick={async () => {
                  setSaving(true);
                  setNoteErr(null);
                  try {
                    await adminApi.patchOrder(order.id, { resultNote: note });
                    await onSaved();
                  } catch (e) {
                    setNoteErr(errMessage(e));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                保存备注
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Link to="/faults" className="text-brand-600 hover:underline">
              前往客户端故障列表
            </Link>
            <span className="text-slate-400">（关联故障 #{order.faultId}）</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTimeline(order: AdminOrderRow): Array<{ key: string; title: string; time: string }> {
  const steps: Array<{ key: string; title: string; time: string }> = [
    { key: "create", title: "工单创建", time: fmt(order.createdAt) },
  ];
  if (order.status !== "pending" && order.assignedTo) {
    steps.push({ key: "assign", title: "已派单", time: "—（暂无单独派单时间戳）" });
  }
  if (order.arrivalTime) {
    steps.push({ key: "arrive", title: "到场", time: fmt(order.arrivalTime) });
  } else if (["arrived", "in_progress", "done", "closed"].includes(order.status)) {
    steps.push({ key: "arrive", title: "到场", time: "—" });
  }
  if (order.completeTime) {
    steps.push({ key: "complete", title: "完成维修", time: fmt(order.completeTime) });
  } else if (order.status === "done" || order.status === "closed") {
    steps.push({ key: "complete", title: "完成维修", time: "—" });
  }
  if (order.status === "closed") {
    steps.push({ key: "close", title: "工单关闭", time: fmt(order.updatedAt) });
  }
  if (order.status === "rejected") {
    steps.push({ key: "reject", title: "已驳回", time: fmt(order.updatedAt) });
  }
  return steps;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}
