import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import { errMessage } from "@/api/client";
import { getFaultReport, listFaultReports } from "@/api/fault";
import { useAuthStore } from "@/store/authStore";
import { SeverityPill, StatusPill } from "@/components/FaultBadges";
import FaultSubmitForm from "@/components/FaultSubmitForm";
import FaultDetailPanel from "@/components/FaultDetailPanel";
import type { FaultReport, FaultSeverity, FaultStatus } from "@/api/types";

const STATUSES: ("" | FaultStatus)[] = ["", "pending", "processing", "closed"];
const SEVERITIES: ("" | FaultSeverity)[] = ["", "low", "medium", "high", "critical"];

export default function FaultsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "operator";

  const [items, setItems] = useState<FaultReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<"" | FaultStatus>("");
  const [severity, setSeverity] = useState<"" | FaultSeverity>("");
  const [keyword, setKeyword] = useState("");
  const [mine, setMine] = useState(!isAdmin);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showSubmit, setShowSubmit] = useState(false);
  const [active, setActive] = useState<FaultReport | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFaultReports({
        status: status || undefined,
        severity: severity || undefined,
        keyword: keyword.trim() || undefined,
        mine: mine || undefined,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [status, severity, keyword, mine, page]);

  useEffect(() => { refresh(); }, [refresh]);

  // 30s 自动刷新（让 AI 分析结果浮出来）
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function reloadDetail(id: number) {
    try {
      const r = await getFaultReport(id);
      setActive(r);
      setItems((prev) => prev.map((it) => (it.id === id ? r : it)));
    } catch { /* ignore */ }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">故障报告</h2>
          <p className="text-sm text-slate-500">提交故障 → AI 立即给出初步分析 → 人工确认与处理。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSubmit((v) => !v)}
          className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 sm:self-start"
        >{showSubmit ? "收起表单" : "+ 提交故障"}</button>
      </header>

      {showSubmit && (
        <FaultSubmitForm
          onCreated={(r) => {
            setShowSubmit(false);
            setActive(r);
            setMine(true);
            setPage(1);
            refresh();
          }}
          onCancel={() => setShowSubmit(false)}
        />
      )}

      {/* 筛选 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <Filter label="状态">
          <select value={status} onChange={(e) => { setStatus(e.target.value as FaultStatus | ""); setPage(1); }} className="text-sm border-slate-300 rounded-md">
            {STATUSES.map((s) => <option key={s} value={s}>{s === "" ? "全部" : { pending: "待处理", processing: "处理中", closed: "已关闭" }[s as FaultStatus]}</option>)}
          </select>
        </Filter>
        <Filter label="严重">
          <select value={severity} onChange={(e) => { setSeverity(e.target.value as FaultSeverity | ""); setPage(1); }} className="text-sm border-slate-300 rounded-md">
            {SEVERITIES.map((s) => <option key={s} value={s}>{s === "" ? "全部" : { low: "一般", medium: "中等", high: "较重", critical: "严重" }[s as FaultSeverity]}</option>)}
          </select>
        </Filter>
        <Filter label="关键字">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), refresh())}
            placeholder="标题或描述包含…"
            className="w-full rounded-md border-slate-300 text-sm sm:w-48"
          />
        </Filter>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />
            仅看我提交的
          </label>
        )}
        <div className="flex-1" />
        <button onClick={() => { setPage(1); refresh(); }} className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">刷新</button>
      </div>

      {/* 列表：小屏横向滚动，避免列被压扁导致标签一字一行 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="min-w-[720px] w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 whitespace-nowrap">
            <tr>
              <th className="w-14 px-4 py-2 text-left">#</th>
              <th className="min-w-[10rem] px-4 py-2 text-left">标题</th>
              <th className="px-4 py-2 text-left">类型</th>
              <th className="px-4 py-2 text-left">库区</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">严重</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">状态</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">提交时间</th>
              <th className="px-4 py-2 text-center whitespace-nowrap w-14">AI</th>
            </tr>
          </thead>
          <tbody className="align-middle">
            {loading && items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">暂无故障报告</td></tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                onClick={() => { setActive(r); reloadDetail(r.id); }}
                className={clsx(
                  "cursor-pointer border-t border-slate-100 hover:bg-brand-50/40",
                  active?.id === r.id && "bg-brand-50/60",
                )}
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.id}</td>
                <td className="px-4 py-2">
                  <div className="max-w-[28rem] truncate text-slate-800">{r.title}</div>
                  <div className="max-w-[28rem] truncate text-xs text-slate-400">{r.description}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{r.faultType}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  {r.zoneCode ? <span className="font-mono text-xs">{r.zoneCode}</span> : <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2"><SeverityPill value={r.severity} /></td>
                <td className="whitespace-nowrap px-4 py-2"><StatusPill value={r.status} /></td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{dayjs(r.createdAt).format("MM-DD HH:mm")}</td>
                <td className="whitespace-nowrap px-4 py-2 text-center">
                  {r.aiAnalysis ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300 text-xs">分析中</span>}
                </td>
              </tr>
            ))}
        </tbody>
        </table>
        </div>

        {/* 分页 */}
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>共 {total} 条</div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded px-2 py-1 hover:bg-slate-200 disabled:opacity-40">上一页</button>
            <span className="tabular-nums">{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="rounded px-2 py-1 hover:bg-slate-200 disabled:opacity-40">下一页</button>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {/* 详情面板 */}
      {active && (
        <FaultDetailPanel
          report={active}
          onUpdated={(r) => {
            setActive(r);
            setItems((prev) => prev.map((it) => (it.id === r.id ? r : it)));
          }}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <span className="text-slate-500 text-xs">{label}</span>
      {children}
    </label>
  );
}
