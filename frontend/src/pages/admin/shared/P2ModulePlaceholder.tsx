/**
 * Step 9：P2 模块前台占位骨架（后端对应对应路由统一 501 + NOT_IMPLEMENTED）
 */

interface Props {
  title: string;
  /** `/api/admin/...` 前缀说明 */
  apiPrefix: string;
  bullets: readonly string[];
  jobNotes?: readonly string[];
}

export default function P2ModulePlaceholder({ title, apiPrefix, bullets, jobNotes }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 p-8 text-slate-700 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-amber-800/90">Step 9 · P2 占位</div>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        当前阶段仅保留导航与占位页；对上述 API 的请求将返回 HTTP <span className="font-mono">501</span> 与{' '}
        <span className="font-mono">NOT_IMPLEMENTED</span>（JSON 中带 <span className="font-mono">module</span>{' '}
        字段便于联调查询）。
      </p>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
        {apiPrefix}
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {jobNotes && jobNotes.length > 0 ? (
        <div className="mt-6 border-t border-amber-200/80 pt-4 text-xs text-slate-500">
          <div className="font-medium text-slate-700">后端 Job 占位</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {jobNotes.map((j) => (
              <li key={j}>{j}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
