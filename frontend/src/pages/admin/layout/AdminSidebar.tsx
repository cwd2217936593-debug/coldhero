/**
 * 管理后台左侧导航（提示词 Step 10）
 * — P1：监控 / 工单 / 区域 / 用户；P2（Step 9 问卷/报表/会员占位）弱化并标注
 * — md 以下为抽屉式，宽度与顶栏汉堡联动（见 AdminLayout）
 */

import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "@/store/authStore";
import { ADMIN_NAV_LINKS } from "./adminNavConfig";

export default function AdminSidebar({
  mobileOpen,
  onNavigate,
}: {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const open = mobileOpen ?? false;
  const userRole = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = userRole === "admin";
  const navLinks = ADMIN_NAV_LINKS.filter((l) => !l.superAdminOnly || isSuperAdmin);

  return (
    <aside
      className={clsx(
        "flex w-[14rem] flex-col border-r border-slate-800 bg-slate-900 text-slate-100 md:relative md:z-0 md:flex-shrink-0",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      aria-label="管理后台导航"
    >
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="text-sm font-semibold">ColdHero</div>
        <div className="text-xs text-slate-400">运维控制台 · Step 10</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              clsx(
                "block rounded-lg px-3 py-2 text-sm transition",
                isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/70",
                l.dim && !isActive && "text-slate-500",
              )
            }
          >
            {l.label}
            {l.dim ? <span className="ml-1 text-[10px] text-slate-500">P2</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3 text-xs text-slate-500">
        <NavLink to="/dashboard" className="text-sky-300 hover:underline" onClick={() => onNavigate?.()}>
          ← 返回客户端
        </NavLink>
      </div>
    </aside>
  );
}
