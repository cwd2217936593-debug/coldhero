/**
 * 管理端布局：左侧导航 + 顶栏 + 主内容（Outlet）（提示词 Step 10 / 与 Step 11 库区标题联动）
 * — 移动端侧栏抽屉、文档标题、`#admin-main-content` 锚点跳转
 */

import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { useAdminShellTitle } from "./useAdminShellTitle";

export default function AdminLayout() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sectionTitle = useAdminShellTitle();

  useEffect(() => {
    document.title = `${sectionTitle} · ColdHero 运维`;
    return () => {
      document.title = "ColdHero";
    };
  }, [sectionTitle]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-[100dvh] bg-slate-100">
      <a
        href="#admin-main-content"
        className="pointer-events-none fixed left-3 top-3 z-[100] rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 opacity-0 shadow-lg ring-2 ring-brand-600 transition-opacity focus:pointer-events-auto focus:opacity-100 focus:outline-none"
      >
        跳到主内容
      </a>

      <button
        type="button"
        aria-label="关闭侧边导航"
        className={clsx(
          "fixed inset-0 z-40 bg-black/45 transition-opacity md:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />

      <AdminSidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader sectionTitle={sectionTitle} onToggleMobileNav={() => setMobileNavOpen((x) => !x)} />
        <main id="admin-main-content" className="min-h-0 flex-1 overflow-auto p-4 sm:p-6" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
