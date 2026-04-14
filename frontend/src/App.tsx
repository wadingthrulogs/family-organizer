import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout.tsx';

// Eager: entry-point routes used on cold load (kiosk + dashboard + login).
import DashboardPage from './pages/DashboardPage.tsx';
import KioskPage from './pages/KioskPage.tsx';
import LoginPage from './pages/LoginPage.tsx';

// Lazy: everything else. Keeps react-grid-layout, calendar/meal-plan deps,
// and settings forms out of the main bundle (perf-audit-2026-04 §2).
const CalendarPage = lazy(() => import('./pages/CalendarPage.tsx'));
const TasksPage = lazy(() => import('./pages/TasksPage.tsx'));
const ChoresPage = lazy(() => import('./pages/ChoresPage.tsx'));
const GroceryPage = lazy(() => import('./pages/GroceryPage.tsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.tsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.tsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx'));
const MealPlanPage = lazy(() => import('./pages/MealPlanPage.tsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.tsx'));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-th-border border-t-btn-primary" />
    </div>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="kiosk" element={<KioskPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="chores" element={<ChoresPage />} />
          <Route path="grocery" element={<GroceryPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="meal-plans" element={<MealPlanPage />} />
          <Route path="reminders" element={<Navigate to="/notifications" replace />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
