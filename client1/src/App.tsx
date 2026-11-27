import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { RequireRole } from './auth/RequireRole';
import type { Permission } from './auth/roles';
import type { ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import MaterialDetailPage from './pages/MaterialDetailPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import RiskPage from './pages/RiskPage';
import SimulatorPage from './pages/SimulatorPage';
import SuppliersPage from './pages/SuppliersPage';
import EventsPage from './pages/EventsPage';
import RecommendationsPage from './pages/RecommendationsPage';
import RecommendationDetailPage from './pages/RecommendationDetailPage';
import AlertsPage from './pages/AlertsPage';
import AgentChatPage from './pages/AgentChatPage';
import AdminPage from './pages/AdminPage';

const guard = (permission: Permission, el: ReactNode) => <RequireRole permission={permission}>{el}</RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireRole>
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={guard('view_dashboard', <DashboardPage />)} />
        <Route path="inventory" element={guard('view_dashboard', <InventoryPage />)} />
        <Route path="inventory/:materialId" element={guard('view_dashboard', <MaterialDetailPage />)} />
        <Route path="orders" element={guard('view_orders', <OrdersPage />)} />
        <Route path="orders/:orderId" element={guard('view_orders', <OrderDetailPage />)} />
        <Route path="risk" element={guard('view_orders', <RiskPage />)} />
        <Route path="simulator" element={guard('simulate', <SimulatorPage />)} />
        <Route path="suppliers" element={guard('view_suppliers', <SuppliersPage />)} />
        <Route path="events" element={guard('post_events', <EventsPage />)} />
        <Route path="recommendations" element={guard('view_recs', <RecommendationsPage />)} />
        <Route path="recommendations/:recId" element={guard('view_recs', <RecommendationDetailPage />)} />
        <Route path="alerts" element={guard('view_alerts', <AlertsPage />)} />
        <Route path="agent" element={guard('run_agent', <AgentChatPage />)} />
        <Route path="admin" element={guard('admin_tools', <AdminPage />)} />
        <Route
          path="*"
          element={
            <div className="card">
              <h2 className="mb-2 text-lg font-semibold">Not found</h2>
              <Link className="link-text" to="/">
                Back to dashboard
              </Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
