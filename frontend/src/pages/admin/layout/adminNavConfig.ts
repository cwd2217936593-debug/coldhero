/**
 * 管理后台导航与版块标题（Step 10 壳层；Step 11 库区下钻标题由 `useAdminShellTitle` 拉 realtime 增强）
 */

export interface AdminNavItem {
  to: string;
  label: string;
  dim?: boolean;
  /** 与后端 `requireStrictAdminAuth` 对齐：仅 JWT `role === "admin"`（平台管理员），不含运维 `operator` */
  superAdminOnly?: boolean;
}

export const ADMIN_NAV_LINKS: readonly AdminNavItem[] = [
  { to: "/admin/monitor", label: "设备监控" },
  { to: "/admin/orders", label: "工单管理" },
  { to: "/admin/regions", label: "区域管理", superAdminOnly: true },
  { to: "/admin/users", label: "用户管理", superAdminOnly: true },
  { to: "/admin/surveys", label: "问卷管理", dim: true },
  { to: "/admin/reports", label: "数据报表", dim: true },
  { to: "/admin/members", label: "会员提醒", dim: true },
];

const SECTION_FALLBACK = "运维控制台";

/** 与 `pathname` 精确匹配的顶栏版块名（不重读接口取库区名称，避免抖动） */
const SECTION_BY_PATH: Record<string, string> = {
  "/admin/monitor": "设备监控",
  "/admin/orders": "工单管理",
  "/admin/regions": "区域管理",
  "/admin/users": "用户管理",
  "/admin/surveys": "问卷管理（P2）",
  "/admin/reports": "数据报表（P2）",
  "/admin/members": "会员提醒（P2）",
};

/**
 * AdminHeader 占位短标题；库区详情路径在未拉到名称前显示 `库区 #id`（随后由 shell hook 替换为 code·name）。
 */
export function adminShellSectionTitle(pathname: string): string {
  const m = pathname.match(/^\/admin\/monitor\/(\d+)$/);
  if (m) return `设备监控 · 库区 #${m[1]}`;
  return SECTION_BY_PATH[pathname] ?? SECTION_FALLBACK;
}
