/**
 * 管理后台路由树（提示词 Step 10）
 * --------------------------------
 * 由 App.tsx 挂载在 `/admin/*`，外层经 RequireAdmin（admin / operator）。
 * 壳层：`AdminLayout` — 侧边栏 + 顶栏版块标题、`document.title`、库区 `/monitor/:id` 由 realtime 补齐名称。
 * 默认重定向至 `/admin/monitor`；P2 路由指向占位页。
 */

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import AdminLayout from "@/pages/admin/layout/AdminLayout";
import MonitorPage from "@/pages/admin/monitor/MonitorPage";
import ZoneDetailPage from "@/pages/admin/monitor/ZoneDetailPage";
import OrdersPage from "@/pages/admin/orders/OrdersPage";
import UsersPage from "@/pages/admin/users/UsersPage";
import RegionsPage from "@/pages/admin/regions/RegionsPage";
import SurveysPage from "@/pages/admin/surveys/SurveysPage";
import ReportsPlaceholderPage from "@/pages/admin/reports/ReportsPlaceholderPage";
import MembersPage from "@/pages/admin/members/MembersPage";

/** 与后端 `requireStrictAdminAuth` 一致：仅平台管理员 `admin`，不含运维 `operator` */
function RequireStrictAdmin({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") return <Navigate to="/admin/monitor" replace />;
  return children;
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="monitor" replace />} />
        <Route path="monitor" element={<MonitorPage />} />
        <Route path="monitor/:zoneId" element={<ZoneDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route
          path="users"
          element={
            <RequireStrictAdmin>
              <UsersPage />
            </RequireStrictAdmin>
          }
        />
        <Route
          path="regions"
          element={
            <RequireStrictAdmin>
              <RegionsPage />
            </RequireStrictAdmin>
          }
        />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="reports" element={<ReportsPlaceholderPage />} />
        <Route path="members" element={<MembersPage />} />
      </Route>
    </Routes>
  );
}
