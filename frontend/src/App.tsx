import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import CalendarPage from './pages/CalendarPage.tsx';
import TasksPage from './pages/TasksPage.tsx';
import ChoresPage from './pages/ChoresPage.tsx';
import GroceryPage from './pages/GroceryPage.tsx';
import InventoryPage from './pages/InventoryPage.tsx';
import NotificationsPage from './pages/NotificationsPage.tsx';
import RemindersPage from './pages/RemindersPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import KioskPage from './pages/KioskPage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import RegisterPage from './pages/RegisterPage.tsx';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-th-border border-t-btn-primary" />
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="kiosk" element={<KioskPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="chores" element={<ChoresPage />} />
        <Route path="grocery" element={<GroceryPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
