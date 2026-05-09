import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "@/store/authStore";
import { getMyQuota } from "@/api/auth";
import { unreadCount } from "@/api/notifications";
import type { QuotaState } from "@/api/types";

const NAV = [
  { to: "/dashboard",    label: "实时仪表盘", icon: "📊" },
  { to: "/showcase",     label: "橱窗",       icon: "🪟" },
  { to: "/history",      label: "历史与拟合", icon: "📈" },
  { to: "/chat",         label: "AI 问答",    icon: "🤖" },
  { to: "/faults",       label: "故障报告",   icon: "🛠️" },
  { to: "/reports",      label: "AI 检测报告", icon: "📑" },
  { to: "/surveys",      label: "问卷调查",   icon: "📋" },
  { to: "/notifications",label: "通知中心",   icon: "🔔" },
];

const LEVEL_LABEL: Record<string, string> = {
  free: "免费版",
  basic: "基础版",
  pro: "专业版",
  enterprise: "企业版",
};

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [quota, setQuota] = useState<{ aiChat: QuotaState; report: QuotaState } | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const [q, u] = await Promise.all([getMyQuota(), unreadCount()]);
        if (!live) return;
        setQuota({ aiChat: q.aiChat, report: q.report });
        setUnread(u);
      } catch { /* ignore */ }
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  function logout() {
    clear();
    nav("/login");
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* 侧边栏 */}
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-600 grid place-items-center text-white text-base font-bold">CH</div>
          <div>
            <div className="font-semibold leading-tight">ColdHero</div>
            <div className="text-[11px] text-slate-400">冷库智能监管</div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-5 py-2.5 text-sm transition",
                  isActive
                    ? "bg-slate-800 text-white border-l-2 border-brand-400"
                    : "text-slate-300 hover:bg-slate-800/60",
                )
              }
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
              {n.to === "/notifications" && unread > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] rounded-full px-1.5 leading-4">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-400">当前账号</div>
          <div className="text-sm font-medium truncate">{user?.displayName ?? user?.username}</div>
          <div className="text-[11px] text-brand-300 mt-0.5">
            {LEVEL_LABEL[user?.memberLevel ?? "free"]}
          </div>
          <button
            onClick={logout}
            className="mt-3 w-full text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
          <div className="text-sm text-slate-500">您好，{user?.displayName ?? user?.username}</div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            {quota && (
              <>
                <QuotaPill label="AI 问答" q={quota.aiChat} />
                <QuotaPill label="检测报告" q={quota.report} />
              </>
            )}
          </div>
        </header>
        <section className="flex-1 overflow-auto p-6">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function QuotaPill({ label, q }: { label: string; q: QuotaState }) {
  const unlimited = q.limit < 0;
  const ratio = unlimited ? 0 : Math.min(1, q.used / Math.max(1, q.limit));
  const danger = !unlimited && ratio >= 0.8;
  return (
    <div className={clsx("flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1", danger && "bg-rose-50")}>
      <span className={clsx("font-medium", danger ? "text-rose-700" : "text-slate-700")}>{label}</span>
      <span className={clsx(danger ? "text-rose-700" : "text-slate-500")}>
        {unlimited ? "不限" : `${q.used}/${q.limit}`}
      </span>
    </div>
  );
}
