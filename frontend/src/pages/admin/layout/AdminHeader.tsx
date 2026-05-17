/**
 * 管理后台顶栏（提示词 Step 10）
 * — 当前版块标题、用户信息、移动端菜单、返回客户端 / 退出登录
 */

import { Link, useNavigate } from "react-router-dom";
import { logout } from "@/api/session";
import { useAuthStore } from "@/store/authStore";

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  operator: "运维",
  viewer: "访客",
};

export default function AdminHeader({
  sectionTitle,
  onToggleMobileNav,
}: {
  sectionTitle: string;
  onToggleMobileNav: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const label = user?.role ? ROLE_LABEL[user.role] ?? user.role : "";

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          className="-ml-1 rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-label="打开导航菜单"
          onClick={onToggleMobileNav}
        >
          <span className="block h-4 w-5 space-y-1.5">
            <span className="block h-0.5 rounded bg-current" />
            <span className="block h-0.5 rounded bg-current" />
            <span className="block h-0.5 rounded bg-current" />
          </span>
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{sectionTitle}</div>
          <div className="truncate text-xs text-slate-500">ColdHero · 管理后台</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
        {user ? (
          <>
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-slate-800">{user.displayName ?? user.username}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
            <Link
              to="/dashboard"
              className="hidden rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-50 sm:inline-block sm:px-3"
            >
              客户端
            </Link>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-white transition hover:bg-slate-800 sm:px-3"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              退出
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
