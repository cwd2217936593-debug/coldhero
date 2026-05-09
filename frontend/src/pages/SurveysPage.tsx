import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import { errMessage } from "@/api/client";
import {
  createSurvey,
  deleteSurvey,
  getSurvey,
  getSurveySummary,
  listPublishedSurveys,
  listSurveyResponses,
  listSurveysAdmin,
  submitSurveyAnswers,
  updateSurvey,
} from "@/api/surveys";
import { useAuthStore } from "@/store/authStore";
import type { Survey, SurveyAnswers, SurveyQuestion, SurveyStatus } from "@/api/types";

const STATUS_TAB: { value: SurveyStatus | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "closed", label: "已关闭" },
];

export default function SurveysPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === "admin" || user?.role === "operator";

  const [tab, setTab] = useState<"fill" | "manage">("fill");
  const [published, setPublished] = useState<Survey[]>([]);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 管理端
  const [adminList, setAdminList] = useState<Survey[]>([]);
  const [adminStatus, setAdminStatus] = useState<SurveyStatus | "">("");
  const [manageSurvey, setManageSurvey] = useState<Survey | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getSurveySummary>> | null>(null);
  const [respPage, setRespPage] = useState(1);
  const [responses, setResponses] = useState<{ items: import("@/api/types").SurveyResponseRow[]; total: number } | null>(null);

  const refreshPublished = useCallback(() => {
    listPublishedSurveys().then(setPublished).catch(() => {});
  }, []);

  const refreshAdmin = useCallback(() => {
    if (!canManage) return;
    listSurveysAdmin({
      status: adminStatus || undefined,
      page: 1,
      pageSize: 50,
    }).then((d) => setAdminList(d.items)).catch(() => {});
  }, [canManage, adminStatus]);

  useEffect(() => {
    refreshPublished();
  }, [refreshPublished]);

  useEffect(() => {
    if (tab === "manage" && canManage) refreshAdmin();
  }, [tab, canManage, refreshAdmin]);

  async function openFill(s: Survey) {
    setSubmitOk(null);
    setSubmitErr(null);
    try {
      const full = await getSurvey(s.id);
      setActiveSurvey(full);
      const init: SurveyAnswers = {};
      for (const q of full.questions) {
        if (q.type === "multiple") init[q.id] = [];
        else init[q.id] = "";
      }
      setAnswers(init);
    } catch (e) {
      setSubmitErr(errMessage(e));
    }
  }

  async function handleSubmitFill() {
    if (!activeSurvey) return;
    setSubmitErr(null);
    setSubmitOk(null);
    setSubmitting(true);
    try {
      await submitSurveyAnswers(activeSurvey.id, answers);
      setSubmitOk("提交成功，感谢您的反馈！");
      setActiveSurvey(null);
      refreshPublished();
    } catch (e) {
      setSubmitErr(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function openManageDetail(s: Survey) {
    setManageSurvey(s);
    setSummary(null);
    setResponses(null);
    try {
      const [sum, rsp] = await Promise.all([
        getSurveySummary(s.id),
        listSurveyResponses(s.id, { page: 1, pageSize: 20 }),
      ]);
      setSummary(sum);
      setResponses(rsp);
      setRespPage(1);
    } catch {
      setSummary(null);
    }
  }

  async function loadRespPage(p: number) {
    if (!manageSurvey) return;
    const rsp = await listSurveyResponses(manageSurvey.id, { page: p, pageSize: 20 });
    setResponses(rsp);
    setRespPage(p);
  }

  async function setSurveyStatus(id: number, status: SurveyStatus) {
    try {
      await updateSurvey(id, { status });
      refreshAdmin();
      refreshPublished();
      if (manageSurvey?.id === id) {
        const u = await getSurvey(id);
        setManageSurvey(u);
      }
    } catch (e) {
      alert(errMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">问卷调查</h2>
          <p className="text-sm text-slate-500">参与已发布的调研；管理员可发布问卷并查看统计与明细。</p>
        </div>
        {canManage && (
          <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setTab("fill")}
              className={clsx(
                "px-3 py-1.5 rounded-md",
                tab === "fill" ? "bg-white shadow text-slate-900" : "text-slate-600",
              )}
            >
              参与调研
            </button>
            <button
              type="button"
              onClick={() => setTab("manage")}
              className={clsx(
                "px-3 py-1.5 rounded-md",
                tab === "manage" ? "bg-white shadow text-slate-900" : "text-slate-600",
              )}
            >
              问卷管理
            </button>
          </div>
        )}
      </header>

      {tab === "fill" && (
        <>
          {submitOk && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{submitOk}</div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {published.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openFill(s)}
                className="text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300 hover:bg-brand-50/30 transition"
              >
                <div className="font-medium text-slate-800">{s.title}</div>
                {s.description && <div className="mt-1 text-xs text-slate-500 line-clamp-2">{s.description}</div>}
                <div className="mt-2 text-xs text-slate-400">{s.questions.length} 道题 · {s.responseCount ?? 0} 人已填</div>
              </button>
            ))}
          </div>
          {published.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500 text-sm">
              暂无已发布的问卷
            </div>
          )}

          {activeSurvey && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActiveSurvey(null)}>
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{activeSurvey.title}</h3>
                    {activeSurvey.description && <p className="mt-1 text-sm text-slate-600">{activeSurvey.description}</p>}
                  </div>
                  <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setActiveSurvey(null)}>✕</button>
                </div>
                <div className="mt-4 space-y-4">
                  {activeSurvey.questions.map((q) => (
                    <QuestionField key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                  ))}
                </div>
                {submitErr && <div className="mt-3 text-sm text-rose-600">{submitErr}</div>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => setActiveSurvey(null)}>取消</button>
                  <button
                    type="button"
                    disabled={submitting}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                    onClick={handleSubmitFill}
                  >
                    {submitting ? "提交中…" : "提交"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "manage" && canManage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={adminStatus}
              onChange={(e) => setAdminStatus(e.target.value as SurveyStatus | "")}
              className="text-sm border-slate-300 rounded-md"
            >
              {STATUS_TAB.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" onClick={refreshAdmin} className="text-sm rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">刷新</button>
            <QuickCreate onCreated={(s) => { refreshAdmin(); refreshPublished(); setManageSurvey(s); }} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">标题</th>
                  <th className="px-3 py-2 text-left">状态</th>
                  <th className="px-3 py-2 text-left">回收</th>
                  <th className="px-3 py-2 text-left">更新</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {adminList.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                    <td className="px-3 py-2">{s.title}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2">{s.responseCount ?? 0}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{dayjs(s.updatedAt).format("MM-DD HH:mm")}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => openManageDetail(s)}>详情</button>
                      {s.status === "draft" && (
                        <button type="button" className="text-xs text-emerald-600 hover:underline" onClick={() => setSurveyStatus(s.id, "published")}>发布</button>
                      )}
                      {s.status === "published" && (
                        <button type="button" className="text-xs text-amber-700 hover:underline" onClick={() => setSurveyStatus(s.id, "closed")}>关闭</button>
                      )}
                      {s.status === "closed" && (
                        <button type="button" className="text-xs text-sky-700 hover:underline" onClick={() => setSurveyStatus(s.id, "published")}>重新开放</button>
                      )}
                      <button type="button" className="text-xs text-rose-600 hover:underline" onClick={async () => {
                        if (!confirm(`删除问卷 #${s.id}？所有答卷将一并删除。`)) return;
                        await deleteSurvey(s.id);
                        refreshAdmin();
                        refreshPublished();
                        if (manageSurvey?.id === s.id) setManageSurvey(null);
                      }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {manageSurvey && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-800">{manageSurvey.title}</h4>
                <button type="button" className="text-xs text-slate-500" onClick={() => setManageSurvey(null)}>收起</button>
              </div>
              {summary && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="text-slate-600 mb-2">选择题汇总（共 {summary.totalResponses} 份答卷）</div>
                  {Object.entries(summary.choiceStats).map(([qid, counts]) => {
                    const q = manageSurvey.questions.find((x) => x.id === qid);
                    if (!q || q.type === "text") return null;
                    return (
                      <div key={qid} className="mb-3 last:mb-0">
                        <div className="text-xs font-medium text-slate-700">{q.title}</div>
                        <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                          {Object.entries(counts).map(([opt, n]) => (
                            <li key={opt}>{opt}：{n}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              {responses && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">最近答卷（第 {respPage} 页 / 共 {responses.total} 条）</div>
                  <div className="max-h-48 overflow-y-auto text-xs font-mono bg-slate-900 text-slate-100 rounded-md p-2">
                    {responses.items.map((row) => (
                      <div key={row.id} className="border-b border-slate-700 py-1">
                        #{row.id} user={row.userId ?? "anon"} {dayjs(row.createdAt).format("MM-DD HH:mm")}<br />
                        {JSON.stringify(row.answers)}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={respPage <= 1} className="text-xs px-2 py-1 rounded border disabled:opacity-40" onClick={() => loadRespPage(respPage - 1)}>上一页</button>
                    <button type="button" disabled={respPage * 20 >= responses.total} className="text-xs px-2 py-1 rounded border disabled:opacity-40" onClick={() => loadRespPage(respPage + 1)}>下一页</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SurveyStatus }) {
  const m: Record<SurveyStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    published: "bg-emerald-100 text-emerald-800",
    closed: "bg-slate-200 text-slate-600",
  };
  const l: Record<SurveyStatus, string> = { draft: "草稿", published: "已发布", closed: "已关闭" };
  return <span className={clsx("text-xs px-2 py-0.5 rounded-full", m[status])}>{l[status]}</span>;
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  if (q.type === "text") {
    return (
      <label className="block">
        <span className="text-sm font-medium text-slate-800">{q.title}</span>
        <textarea
          className="mt-1 w-full rounded-md border-slate-300 text-sm"
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  if (q.type === "single") {
    return (
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{q.title}</legend>
        <div className="mt-2 space-y-1.5">
          {(q.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={q.id}
                checked={value === opt}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const arr = Array.isArray(value) ? value : [];
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{q.title}</legend>
      <div className="mt-2 space-y-1.5">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={arr.includes(opt)}
              onChange={() => {
                if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
                else onChange([...arr, opt]);
              }}
            />
            {opt}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function QuickCreate({ onCreated }: { onCreated: (s: Survey) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("冷库巡检体验 Quick 问卷");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm rounded-md bg-slate-800 text-white px-3 py-1.5 hover:bg-slate-700">
        + 快速新建
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm border rounded px-2 py-1 flex-1 min-w-[200px]" placeholder="问卷标题" />
      <button
        type="button"
        disabled={busy}
        className="text-sm px-3 py-1 rounded bg-brand-600 text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          try {
            const s = await createSurvey({
              title: title.trim() || "未命名问卷",
              description: "由「快速新建」生成，可在后端或 SQL 中调整题目。",
              status: "draft",
              questions: [
                { id: "q1", type: "single", title: "本周设备运行是否稳定？", options: ["稳定", "偶有告警", "不稳定"] },
                { id: "q2", type: "text", title: "其它意见" },
              ],
            });
            onCreated(s);
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        创建草稿
      </button>
      <button type="button" className="text-sm text-slate-500" onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}
