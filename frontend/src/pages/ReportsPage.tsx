import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import { errMessage } from "@/api/client";
import { deleteReport, getReport, listReports, STATUS_META, submitReport, TYPE_LABEL } from "@/api/reports";
import { listZones } from "@/api/sensors";
import { getMyPlan } from "@/api/auth";
import { publicAssetUrl } from "@/lib/publicAssetUrl";
import type { GeneratedReport, MemberPlan, ReportFormat, ReportType, Zone } from "@/api/types";

const LEVEL_LABEL: Record<string, string> = {
  free: "免费版",
  basic: "基础版",
  pro: "专业版",
  enterprise: "企业版",
};

const TYPES: ReportType[] = ["daily", "weekly", "latest"];

export default function ReportsPage() {
  const [plan, setPlan] = useState<MemberPlan | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);

  const [reportType, setReportType] = useState<ReportType>("daily");
  const [zoneIds, setZoneIds] = useState<number[]>([]);
  const [formats, setFormats] = useState<ReportFormat[]>(["pdf"]);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [items, setItems] = useState<GeneratedReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<GeneratedReport | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    listZones().then(setZones).catch(() => {});
    getMyPlan().then(setPlan).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReports({ page, pageSize });
      setItems(data.items);
      setTotal(data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { refresh(); }, [refresh]);

  // 有 queued/processing 的任务时启动短轮询
  const hasInflight = useMemo(() => items.some((r) => r.status === "queued" || r.status === "processing"), [items]);
  useEffect(() => {
    if (!hasInflight) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [hasInflight, refresh]);

  async function handleSubmit() {
    setSubmitErr(null);
    if (formats.length === 0) return setSubmitErr("请至少选择一种文件格式");
    if (formats.includes("docx") && plan && !plan.allowDocxExport) {
      return setSubmitErr("当前会员不支持 Word 导出，请升级到基础版及以上");
    }
    setSubmitting(true);
    try {
      const r = await submitReport({
        reportType,
        zoneIds: zoneIds.length ? zoneIds : null,
        formats,
      });
      setItems((prev) => [r, ...prev]);
      setActive(r);
      setTotal((t) => t + 1);
    } catch (e) {
      setSubmitErr(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadActive() {
    if (!active) return;
    try {
      const r = await getReport(active.id);
      setActive(r);
      setItems((prev) => prev.map((it) => it.id === r.id ? r : it));
    } catch { /* ignore */ }
  }

  // active 在排队中时也轮询其详情
  useEffect(() => {
    if (!active || (active.status !== "queued" && active.status !== "processing")) return;
    const t = setInterval(reloadActive, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status]);

  async function handleDelete(id: number) {
    if (!confirm(`确定删除报告 #${id}?`)) return;
    await deleteReport(id);
    if (active?.id === id) setActive(null);
    refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-800">AI 检测报告</h2>
        <p className="text-sm text-slate-500">基于历史温/湿/CO₂ 数据 + 关联故障，由 AI 一键生成 PDF / Word 检测报告。</p>
      </header>

      {/* 提交表单 */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="报告类型">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="text-sm border-slate-300 rounded-md w-40"
            >
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="范围（多选；空 = 全部库区）">
            <ZoneMultiSelect zones={zones} value={zoneIds} onChange={setZoneIds} />
          </Field>
          <Field label="导出格式">
            <div className="flex items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={formats.includes("pdf")}
                       onChange={(e) => toggle(setFormats, formats, "pdf", e.target.checked)} />
                PDF
              </label>
              <label className={clsx("inline-flex items-center gap-1", plan && !plan.allowDocxExport && "text-slate-300")}>
                <input
                  type="checkbox"
                  disabled={!plan?.allowDocxExport}
                  checked={formats.includes("docx")}
                  onChange={(e) => toggle(setFormats, formats, "docx", e.target.checked)}
                />
                Word（仅 basic+）
              </label>
            </div>
          </Field>
          <div className="flex-1" />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={clsx(
              "px-4 py-2 text-sm rounded-md text-white",
              submitting ? "bg-slate-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {submitting ? "排队中…" : "+ 生成报告"}
          </button>
        </div>
        {submitErr && <div className="mt-2 text-sm text-rose-600">{submitErr}</div>}
        <div className="mt-2 text-xs text-slate-500">
          {plan ? (
            <>当日检测报告配额：<b className="text-slate-700">{plan.reportPerDay < 0 ? "不限" : plan.reportPerDay}</b> · 当前会员：<b>{plan ? LEVEL_LABEL[plan.level] ?? plan.level : "—"}</b></>
          ) : "正在加载会员配额…"}
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="px-4 py-2 text-left w-44">报告编号</th>
              <th className="px-4 py-2 text-left w-32">类型</th>
              <th className="px-4 py-2 text-left">报告期</th>
              <th className="px-4 py-2 text-left w-28">状态</th>
              <th className="px-4 py-2 text-left w-44">下载</th>
              <th className="px-4 py-2 text-left w-32">提交时间</th>
              <th className="px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无报告，先点击"+ 生成报告"</td></tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                onClick={() => setActive(r)}
                className={clsx(
                  "cursor-pointer border-t border-slate-100 hover:bg-brand-50/40",
                  active?.id === r.id && "bg-brand-50/60",
                )}
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.reportNo}</td>
                <td className="px-4 py-2">{TYPE_LABEL[r.reportType]}</td>
                <td className="px-4 py-2 text-slate-700 text-xs">
                  {dayjs(r.timeRange.start).format("MM-DD HH:mm")} ~ {dayjs(r.timeRange.end).format("MM-DD HH:mm")}
                </td>
                <td className="px-4 py-2"><StatusBadge status={r.status} errorMsg={r.errorMsg} /></td>
                <td className="px-4 py-2">
                  {r.status === "done" ? (
                    <div className="flex items-center gap-2">
                      {r.fileUrlPdf && <a className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200" href={publicAssetUrl(r.fileUrlPdf)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>PDF</a>}
                      {r.fileUrlDocx && <a className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200" href={publicAssetUrl(r.fileUrlDocx)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Word</a>}
                    </div>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{dayjs(r.createdAt).format("MM-DD HH:mm:ss")}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    className="text-xs text-slate-400 hover:text-rose-600"
                    title="删除"
                  >×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <div>共 {total} 条 {hasInflight && <span className="text-sky-600">· 自动刷新中…</span>}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">上一页</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">下一页</button>
          </div>
        </div>
      </div>

      {active && (
        <ReportDetail
          report={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function toggle<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, current: T[], v: T, on: boolean) {
  setter(on ? [...current.filter((x) => x !== v), v] : current.filter((x) => x !== v));
}

function ZoneMultiSelect({ zones, value, onChange }: { zones: Zone[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-md">
      {zones.map((z) => {
        const on = value.includes(z.id);
        return (
          <button
            key={z.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== z.id) : [...value, z.id])}
            className={clsx(
              "text-xs px-2 py-1 rounded-full border transition",
              on
                ? "bg-brand-600 border-brand-600 text-white"
                : "bg-white border-slate-300 text-slate-600 hover:border-brand-300",
            )}
          >
            {z.code} {z.name}
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, errorMsg }: { status: GeneratedReport["status"]; errorMsg: string | null }) {
  const m = STATUS_META[status];
  return (
    <span title={errorMsg ?? undefined} className={clsx("text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1", m.classes)}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

function ReportDetail({ report, onClose }: { report: GeneratedReport; onClose: () => void }) {
  const c = report.contentJson;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-slate-50">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-800 truncate">{report.reportNo}</h3>
          <div className="text-xs text-slate-500">
            {TYPE_LABEL[report.reportType]} · {dayjs(report.timeRange.start).format("YYYY-MM-DD HH:mm")} ~ {dayjs(report.timeRange.end).format("YYYY-MM-DD HH:mm")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report.fileUrlPdf && <a href={publicAssetUrl(report.fileUrlPdf)} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700">下载 PDF</a>}
          {report.fileUrlDocx && <a href={publicAssetUrl(report.fileUrlDocx)} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700">下载 Word</a>}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">关闭</button>
        </div>
      </div>

      {report.status === "failed" && (
        <div className="px-5 py-3 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">
          ❌ 生成失败：{report.errorMsg ?? "未知原因"}
        </div>
      )}

      {report.status !== "done" && (
        <div className="p-5 text-sm text-slate-500">
          {report.status === "queued" ? "已排队，等待 worker 处理…" : "正在生成报告，约需 5–15 秒…"}
          <div className="mt-2 h-1 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-brand-500 animate-pulse" style={{ width: report.status === "queued" ? "25%" : "70%" }} />
          </div>
        </div>
      )}

      {report.status === "done" && c && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 space-y-3">
            <Card title="📊 整体概览">
              <Stat label="总样本" value={c.overall.totalSamples} />
              <Stat label="异常点" value={c.overall.totalAnomalies} />
              <Stat label="异常率" value={`${c.overall.anomalyRate}%`} highlight={c.overall.anomalyRate >= 5 ? "bad" : c.overall.anomalyRate >= 1 ? "warn" : "ok"} />
              <Stat label="覆盖库区" value={c.zones.length} />
            </Card>
            {c.recommendations.length > 0 && (
              <Card title="🧰 建议执行项">
                <ul className="text-sm space-y-1.5 list-disc list-inside text-slate-700">
                  {c.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </Card>
            )}
          </div>
          <div className="lg:col-span-2 space-y-3">
            <Card title="🤖 AI 智能总结">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{c.aiSummary}</pre>
            </Card>
            <Card title="🏬 各库区运行明细">
              <div className="space-y-3">
                {c.zones.map((z) => (
                  <div key={z.zone.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs text-slate-500">{z.zone.code}</span>
                      <span className="font-medium text-slate-800">{z.zone.name}</span>
                      <span className="text-xs text-slate-400">阈值 {z.zone.tempMin} ~ {z.zone.tempMax} ℃</span>
                    </div>
                    <div className="text-xs text-slate-600 grid grid-cols-3 sm:grid-cols-5 gap-2">
                      <Stat compact label="样本" value={z.stats.sampleCount} />
                      <Stat compact label="均温" value={`${z.stats.avgTemp ?? "-"} ℃`} />
                      <Stat compact label="极值" value={`${z.stats.minTemp ?? "-"} ~ ${z.stats.maxTemp ?? "-"}`} />
                      <Stat compact label="异常率" value={`${z.stats.anomalyRate}%`} highlight={z.stats.anomalyRate >= 5 ? "bad" : z.stats.anomalyRate >= 1 ? "warn" : "ok"} />
                      <Stat compact label="超限分钟" value={z.stats.overLimitMinutes} highlight={z.stats.overLimitMinutes > 60 ? "bad" : "ok"} />
                    </div>
                    {z.faults.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        <span className="text-slate-500">本期内关联故障：</span>
                        {z.faults.map((f) => (
                          <span key={f.id} className="ml-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            #{f.id} {f.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 border-b border-slate-200">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Stat({ label, value, highlight, compact }: { label: string; value: number | string; highlight?: "ok" | "warn" | "bad"; compact?: boolean }) {
  const colorMap = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-rose-600" };
  return (
    <div className={clsx("flex", compact ? "items-baseline gap-1" : "items-center justify-between py-1 border-b border-slate-100 last:border-0")}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className={clsx("text-sm font-medium", highlight ? colorMap[highlight] : "text-slate-800")}>
        {value}
      </span>
    </div>
  );
}
