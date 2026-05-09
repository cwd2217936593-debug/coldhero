import { useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import {
  patchFaultReport,
  reanalyzeFaultReport,
} from "@/api/fault";
import { errMessage } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import { SeverityPill, StatusPill } from "@/components/FaultBadges";
import type { FaultReport, FaultSeverity, FaultStatus } from "@/api/types";

const STATUSES: FaultStatus[] = ["pending", "processing", "closed"];
const SEVERITIES: FaultSeverity[] = ["low", "medium", "high", "critical"];

interface Props {
  report: FaultReport;
  onUpdated: (r: FaultReport) => void;
  onClose: () => void;
}

export default function FaultDetailPanel({ report, onUpdated, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "operator";
  const [reanalyzing, setReanalyzing] = useState(false);
  const [savingPatch, setSavingPatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handlerNote, setHandlerNote] = useState(report.handlerNote ?? "");

  async function handlePatch(patch: Parameters<typeof patchFaultReport>[1]) {
    setError(null);
    setSavingPatch(true);
    try {
      const r = await patchFaultReport(report.id, patch);
      onUpdated(r);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSavingPatch(false);
    }
  }

  async function handleReanalyze() {
    setError(null);
    setReanalyzing(true);
    try {
      const r = await reanalyzeFaultReport(report.id);
      onUpdated(r);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-slate-50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-slate-500">#{report.id}</span>
          <h3 className="text-base font-semibold text-slate-800 truncate">{report.title}</h3>
          <SeverityPill value={report.severity} />
          <StatusPill value={report.status} />
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">关闭</button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左：基本信息 + 描述 + 图片 */}
        <div>
          <Meta label="提交人">{report.reporterName ?? `用户 ${report.userId}`}</Meta>
          <Meta label="所属库区">
            {report.zoneCode ? <>
              <span className="font-mono">{report.zoneCode}</span>
              <span className="text-slate-400 mx-1">·</span>
              {report.zoneName}
            </> : <span className="text-slate-400">未关联库区</span>}
          </Meta>
          <Meta label="故障类型">{report.faultType}</Meta>
          <Meta label="提交时间">{dayjs(report.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Meta>
          {report.closedAt && <Meta label="关闭时间">{dayjs(report.closedAt).format("YYYY-MM-DD HH:mm:ss")}</Meta>}

          <div className="mt-4">
            <h4 className="text-xs text-slate-500 mb-1">详细描述</h4>
            <div className="bg-slate-50 rounded-md p-3 text-sm whitespace-pre-wrap text-slate-700">
              {report.description}
            </div>
          </div>

          {report.imageUrls.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs text-slate-500 mb-1">现场照片（{report.imageUrls.length}）</h4>
              <div className="grid grid-cols-3 gap-2">
                {report.imageUrls.map((img) => (
                  <a key={img.key} href={img.url} target="_blank" rel="noreferrer"
                     className="aspect-square rounded-md overflow-hidden border border-slate-200 group block">
                    <img src={img.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：AI 分析 + 状态操作 */}
        <div>
          <div className="border border-brand-100 bg-brand-50/50 rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-brand-100">
              <div className="text-sm font-medium text-brand-700">🤖 AI 初步分析</div>
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className={clsx(
                  "text-xs px-2 py-1 rounded",
                  reanalyzing ? "text-slate-400" : "text-brand-700 hover:bg-brand-100",
                )}
              >
                {reanalyzing ? "重新分析中…" : "重新分析"}
              </button>
            </div>
            <div className="p-3 max-h-96 overflow-auto">
              {report.aiAnalysis ? (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                  {report.aiAnalysis}
                </pre>
              ) : (
                <div className="text-sm text-slate-400">AI 分析进行中，稍后刷新即可…</div>
              )}
            </div>
          </div>

          <div className="mt-4 border border-slate-200 rounded-lg p-3">
            <h4 className="text-sm font-medium text-slate-700 mb-2">维修流程</h4>
            <div className="grid grid-cols-2 gap-2">
              <Picker label="状态" value={report.status} options={STATUSES.map((s) => ({ value: s, label: { pending: "待处理", processing: "处理中", closed: "已关闭" }[s] }))}
                disabled={!isAdmin || savingPatch}
                onChange={(v) => handlePatch({ status: v as FaultStatus })}
              />
              <Picker label="严重程度" value={report.severity} options={SEVERITIES.map((s) => ({ value: s, label: { low: "一般", medium: "中等", high: "较重", critical: "严重" }[s] }))}
                disabled={!isAdmin || savingPatch}
                onChange={(v) => handlePatch({ severity: v as FaultSeverity })}
              />
            </div>
            <div className="mt-2">
              <span className="text-xs text-slate-500">维修人员处理意见</span>
              <textarea
                rows={3}
                value={handlerNote}
                onChange={(e) => setHandlerNote(e.target.value)}
                placeholder={isAdmin ? "记录排查与处理过程..." : "（仅管理员/运维可编辑）"}
                disabled={!isAdmin}
                className="mt-1 w-full text-sm border-slate-300 rounded-md disabled:bg-slate-50 disabled:text-slate-400"
              />
              {isAdmin && (
                <div className="mt-1 flex justify-end">
                  <button
                    onClick={() => handlePatch({ handlerNote })}
                    disabled={savingPatch}
                    className="text-xs px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white"
                  >保存意见</button>
                </div>
              )}
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-1 text-sm py-1 border-b border-slate-100 last:border-0">
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

function Picker<T extends string>({ label, value, options, disabled, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        className="w-full text-sm border-slate-300 rounded-md disabled:bg-slate-50"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
