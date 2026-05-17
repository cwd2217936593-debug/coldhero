import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "@/store/authStore";
import { getMyPlan, getMyQuota } from "@/api/auth";
import { logout } from "@/api/session";
import { unreadCount } from "@/api/notifications";
import type { MemberPlan, QuotaState } from "@/api/types";

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
  const nav = useNavigate();
  const location = useLocation();
  const [quota, setQuota] = useState<{ aiChat: QuotaState; report: QuotaState } | null>(null);
  const [plan, setPlan] = useState<MemberPlan | null>(null);
  const [unread, setUnread] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = [
    ...NAV,
    ...(user?.role === "admin" || user?.role === "operator"
      ? [{ to: "/admin/monitor", label: "管理后台", icon: "🛡️" }]
      : []),
  ];

  useEffect(() => {
    let live = true;
    getMyPlan()
      .then((p) => {
        if (live) setPlan(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  async function switchAccount() {
    await logout();
    nav("/login");
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-50">
      <button
        type="button"
        aria-label="关闭导航菜单"
        className={clsx(
          "fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-[min(17.5rem,88vw)] min-h-0 flex-col bg-slate-900 text-slate-100 shadow-xl transition-transform duration-200 ease-out lg:static lg:z-0 lg:h-[100dvh] lg:w-60 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white">CH</div>
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">ColdHero</div>
              <div className="truncate text-[11px] text-slate-400">冷库智能监管</div>
            </div>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 lg:hidden"
            aria-label="关闭侧边栏"
            onClick={() => setMobileNavOpen(false)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition sm:px-5",
                  isActive
                    ? "border-l-2 border-brand-400 bg-slate-800 text-white"
                    : "border-l-2 border-transparent text-slate-300 hover:bg-slate-800/60",
                )
              }
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
              {n.to === "/notifications" && unread > 0 && (
                <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] leading-4 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-shrink-0 flex-col gap-3 border-t border-slate-800 bg-slate-900 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-2.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300"
              aria-hidden
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400">当前账号</div>
              <div className="truncate text-sm font-medium">{user?.displayName ?? user?.username}</div>
              <div className="mt-0.5 text-[11px] text-brand-300">
                {LEVEL_LABEL[plan?.level ?? "free"]}
              </div>
            </div>
            <button
              type="button"
              onClick={switchAccount}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              title="切换账号"
              aria-label="切换账号"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={switchAccount}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
          >
            <svg className="h-4 w-4 shrink-0 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3" />
            </svg>
            切换账号
          </button>
          <button
            type="button"
            onClick={switchAccount}
            className="w-full rounded-lg border border-slate-700 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-800/50"
          >
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <header className="flex min-h-[3rem] flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0 sm:h-12">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden hover:bg-slate-50"
              aria-label="打开菜单"
              onClick={() => setMobileNavOpen(true)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate text-sm text-slate-500">
              您好，{user?.displayName ?? user?.username}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:gap-3">
            <button
              type="button"
              onClick={switchAccount}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="切换账号"
              aria-label="切换账号"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </button>
            {quota && (
              <>
                <QuotaPill label="AI 问答" q={quota.aiChat} />
                <QuotaPill label="检测报告" q={quota.report} />
              </>
            )}
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
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
    <div className={clsx("flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 sm:gap-2 sm:px-3", danger && "bg-rose-50")}>
      <span className={clsx("font-medium text-[10px] sm:text-xs", danger ? "text-rose-700" : "text-slate-700")}>{label}</span>
      <span className={clsx("text-[10px] sm:text-xs", danger ? "text-rose-700" : "text-slate-500")}>
        {unlimited ? "不限" : `${q.used}/${q.limit}`}
      </span>
    </div>
  );
}
