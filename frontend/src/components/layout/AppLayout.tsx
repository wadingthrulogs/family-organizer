import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../hooks/useAuth';
import { useUserPreferences } from '../../hooks/useUserPreferences';

const navItems = [
  { to: '/', label: 'Dashboard', key: 'dashboard' },
  { to: '/calendar', label: 'Calendar', key: 'calendar' },
  { to: '/tasks', label: 'Tasks', key: 'tasks' },
  { to: '/chores', label: 'Chores', key: 'chores' },
  { to: '/grocery', label: 'Grocery', key: 'grocery' },
  { to: '/inventory', label: 'Inventory', key: 'inventory' },
  { to: '/meal-plans', label: 'Meal Plan', key: 'meal-plans' },
  { to: '/notifications', label: 'Notifications', key: 'notifications' },
  { to: '/settings', label: 'Settings', key: 'settings' },
];

export function AppLayout() {
  const { data: settings } = useSettings();
  const { user, logout } = useAuth();
  const { data: prefs } = useUserPreferences();
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const bgImageUrl = isDashboard ? prefs?.dashboardConfig?.preferences?.backgroundImageUrl : undefined;
  const bgOpacity = isDashboard ? (prefs?.dashboardConfig?.preferences?.backgroundOverlay ?? 1) : 0;
  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }, []);
  const householdName = settings?.householdName?.trim() ? settings.householdName : 'Harbor Family';
  const hiddenTabs = settings?.hiddenTabs ?? [];
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !hiddenTabs.includes(item.key)),
    [hiddenTabs]
  );
  const displayName = user?.username ?? 'User';
  const roleLabel = user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : '';
  const initials = useMemo(() => {
    return displayName
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || 'U';
  }, [displayName]);

  return (
    <div className="min-h-screen bg-page">
      {bgImageUrl && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            opacity: bgOpacity,
            zIndex: 0,
          }}
        />
      )}
      <header className="sticky top-0 z-20 bg-page/90 backdrop-blur border-b border-th-border">
        <div className={`mx-auto flex items-center justify-between px-4 py-4 ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Today</p>
            <p className="font-display text-xl text-heading">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-primary">{displayName}</p>
              <p className="text-xs text-muted">{roleLabel} · {householdName}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-accent text-btn-primary-text flex items-center justify-center font-semibold">
              {initials}
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-th-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-hover-bg"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className={`mx-auto flex gap-2 overflow-x-auto px-4 pb-4 ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                  isActive ? 'bg-nav-active text-nav-active-text' : 'bg-nav-pill text-nav-pill-text'
                }`
              }
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={`mx-auto px-4 py-8 ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
