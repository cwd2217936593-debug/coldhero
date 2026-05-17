import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/api/auth";
import { probeBackendDeep } from "@/api/health";
import { errMessage } from "@/api/client";
import { isHybridMockWithBackend } from "@/lib/deepseekBridge";
import { useAuthStore } from "@/store/authStore";

const PRESETS = [
  { label: "管理员",   id: "admin",       desc: "enterprise · 系统管理员" },
  { label: "免费版",   id: "demo_free",   desc: "free · 5 次问答 / 天" },
  { label: "基础版",   id: "demo_basic",  desc: "basic · 30 次问答" },
  { label: "专业版",   id: "demo_pro",    desc: "pro · 100 次 + 优先生成" },
  { label: "企业版",   id: "demo_ent",    desc: "enterprise · 无限制" },
];

export default function LoginPage() {
  const nav = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("Coldhero@123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [infraHint, setInfraHint] = useState<string | null>(null);

  useEffect(() => {
    if (token) nav("/dashboard", { replace: true });
  }, [token, nav]);

  useEffect(() => {
    if (!isHybridMockWithBackend()) return;
    let cancelled = false;
    probeBackendDeep().then(({ ok, summary }) => {
      if (cancelled) return;
      setInfraHint(
        ok
          ? null
          : `后端依赖检测未通过：${summary}。\n\n操作建议（项目根目录 coldhero）：\n① 仅数据库：npm run docker:deps\n② 数据库 + 容器内 API：npm run docker:api（需已复制 .env.example 为 .env，且 Docker 能拉镜像）\n③ 本地调试用后端：执行①后在 backend 目录 npm run dev\n\n验证：浏览器打开 http://localhost:4000/api/health 应返回 JSON。`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await login(identifier, password);
      setAuth(r.token, r.user, r.refreshToken);
      nav("/dashboard", { replace: true });
    } catch (e2) {
      setErr(errMessage(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-slate-100 via-brand-50 to-cyan-50 lg:flex-row">
      <div className="hidden flex-1 items-center justify-center p-12 lg:flex">
        <div className="max-w-md text-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-brand-600 grid place-items-center text-white text-xl font-bold">CH</div>
            <div>
              <div className="text-2xl font-bold text-slate-900">冷库智能监管平台</div>
              <div className="text-sm text-slate-500">ColdHero · AI 驱动的冷链监管</div>
            </div>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed">
            <li className="flex gap-2"><span className="text-brand-600">●</span> 全库区实时温/湿/CO₂ 监测，异常 3 分钟去抖告警</li>
            <li className="flex gap-2"><span className="text-brand-600">●</span> 接入 DeepSeek / 通义千问，AI 即问即答（SSE 流式）</li>
            <li className="flex gap-2"><span className="text-brand-600">●</span> 历史曲线 + 模型预测虚线对比，自动计算 RMSE / MAE</li>
            <li className="flex gap-2"><span className="text-brand-600">●</span> 4 档会员配额，Redis 原子限流，UTC+8 自动切日</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:items-center lg:px-8">
        <form onSubmit={submit} className="mx-auto w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">CH</div>
            <div>
              <div className="font-semibold text-slate-900 leading-tight">冷库智能监管</div>
              <div className="text-[11px] text-slate-500">ColdHero</div>
            </div>
          </div>
          <h1 className="mb-1 text-xl font-semibold text-slate-900">登录</h1>
          <p className="mb-6 text-sm text-slate-500">使用用户名或邮箱登录</p>

          <div className="space-y-3 mb-4">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => { setIdentifier(p.id); setPassword("Coldhero@123"); }}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition ${
                  identifier === p.id
                    ? "bg-brand-50 border-brand-300 ring-1 ring-brand-300"
                    : "hover:bg-slate-50 border-slate-200"
                }`}
              >
                <div className="font-medium text-slate-800">{p.label}</div>
                <div className="text-xs text-slate-500">{p.desc}</div>
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-700 mb-1">账号</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full mb-3 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="用户名或邮箱"
          />
          <label className="block text-xs font-medium text-slate-700 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />

          {infraHint && (
            <div className="mb-3 overflow-hidden break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-800">
              {infraHint}
            </div>
          )}
          {err && <div className="text-sm text-red-600 mb-3 whitespace-pre-wrap">{err}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-60 disabled:cursor-wait transition"
          >
            {loading ? "登录中..." : "登录"}
          </button>

          <div className="mt-4 text-xs text-slate-500 leading-relaxed">
            提示：种子用户的密码 <code className="bg-slate-100 px-1.5 py-0.5 rounded">Coldhero@123</code>，
            首次启动需在后端运行 <code className="bg-slate-100 px-1.5 py-0.5 rounded">npm run seed:passwords</code> 重置。
          </div>
        </form>
      </div>
    </div>
  );
}
