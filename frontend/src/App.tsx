import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import LoginPage from "@/pages/LoginPage";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import HistoryPage from "@/pages/HistoryPage";
import ChatPage from "@/pages/ChatPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ShowcasePage from "@/pages/ShowcasePage";
import FaultsPage from "@/pages/FaultsPage";
import ReportsPage from "@/pages/ReportsPage";
import SurveysPage from "@/pages/SurveysPage";
import AdminRoutes from "@/router/adminRoutes";
import { MobilePreviewToolkit } from "@/dev/MobilePreviewToolkit";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== "admin" && user?.role !== "operator") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/admin/*"
          element={
            <RequireAdmin>
              <AdminRoutes />
            </RequireAdmin>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="showcase" element={<ShowcasePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="faults" element={<FaultsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <MobilePreviewToolkit />
    </>
  );
}
