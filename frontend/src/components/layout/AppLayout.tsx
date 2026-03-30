import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../hooks/useAuth';
import { useUserPreferences } from '../../hooks/useUserPreferences';

const navItems = [
  { to: '/', label: 'Dashboard', key: 'dashboard', icon: '⊞' },
  { to: '/tasks', label: 'Tasks', key: 'tasks', icon: '✓' },
  { to: '/grocery', label: 'Grocery', key: 'grocery', icon: '🛒' },
  { to: '/meal-plans', label: 'Meals', key: 'meal-plans', icon: '🍽️' },
  { to: '/chores', label: 'Chores', key: 'chores', icon: '🧹' },
  { to: '/inventory', label: 'Inventory', key: 'inventory', icon: '📦' },
  { to: '/calendar', label: 'Calendar', key: 'calendar', icon: '📅' },
  { to: '/notifications', label: 'Notifications', key: 'notifications', icon: '🔔' },
  { to: '/settings', label: 'Settings', key: 'settings', icon: '⚙️' },
];

const DEFAULT_BOTTOM_TAB_KEYS = ['dashboard', 'tasks', 'grocery', 'meal-plans'];

export function AppLayout() {
  const { data: settings } = useSettings();
  const { user, logout } = useAuth();
  const { data: prefs } = useUserPreferences();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
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
  const bottomTabKeys =
    prefs?.dashboardConfig?.preferences?.bottomTabKeys ?? DEFAULT_BOTTOM_TAB_KEYS;
  const bottomTabs = useMemo(
    () => navItems.filter((item) => bottomTabKeys.includes(item.key)),
    [bottomTabKeys]
  );
  const moreItems = useMemo(
    () => visibleNavItems.filter((item) => !bottomTabKeys.includes(item.key)),
    [visibleNavItems, bottomTabKeys]
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
        <div className={`mx-auto flex items-center justify-between px-4 py-2 md:py-4 ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
          {/* Date/greeting — hidden on mobile */}
          <div className="hidden md:block">
            <p className="text-xs uppercase tracking-wide text-muted">Today</p>
            <p className="font-display text-xl text-heading">{formattedDate}</p>
          </div>
          {/* Mobile: spacer so avatar stays right-aligned */}
          <div className="md:hidden" />
          <div className="flex items-center gap-4">
            {/* Username + role — hidden on mobile */}
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-primary">{displayName}</p>
              <p className="text-xs text-muted">{roleLabel} · {householdName}</p>
            </div>
            {/* Avatar — tappable on mobile to open account dropdown */}
            <div className="relative">
              <button
                ref={avatarRef}
                type="button"
                onClick={() => setAvatarMenuOpen((v) => !v)}
                className="h-10 w-10 rounded-full bg-accent text-btn-primary-text flex items-center justify-center font-semibold"
                aria-label="Account menu"
              >
                {initials}
              </button>
              {/* Mobile account dropdown */}
              {avatarMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAvatarMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-card border border-th-border bg-card shadow-soft overflow-hidden md:hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-th-border">
                      <div className="h-9 w-9 rounded-full bg-accent text-btn-primary-text flex items-center justify-center font-semibold text-sm shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-heading truncate">{displayName}</p>
                        <p className="text-xs text-muted truncate">{roleLabel} · {householdName}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAvatarMenuOpen(false); logout(); }}
                      className="w-full text-left px-4 py-3 text-sm text-secondary hover:bg-hover-bg transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Sign out button — desktop only */}
            <button
              type="button"
              onClick={logout}
              className="hidden md:inline-flex rounded-full border border-th-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-hover-bg"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Desktop nav — hidden on mobile */}
        <nav className={`mx-auto hidden gap-2 overflow-x-auto px-4 pb-4 md:flex ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
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
      <main className={`mx-auto px-4 py-8 pb-24 md:pb-8 ${isDashboard ? 'max-w-[1800px]' : 'max-w-6xl'}`}>
        <Outlet />
      </main>

      {/* Mobile bottom tab bar — visible only on small screens */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-th-border bg-page/95 backdrop-blur md:hidden">
        {bottomTabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
            onClick={() => setMoreOpen(false)}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* More button */}
        {moreItems.length > 0 && (
          <div className="relative flex flex-1 flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex w-full flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                moreOpen ? 'text-accent' : 'text-muted'
              }`}
            >
              <span className="text-lg leading-none">⋯</span>
              <span>More</span>
            </button>

            {/* More drawer — slides up from the bottom tab bar */}
            {moreOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[160px] rounded-card border border-th-border bg-card py-2 shadow-soft">
                  {moreItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                          isActive ? 'text-accent' : 'text-secondary hover:bg-hover-bg'
                        }`
                      }
                      onClick={() => setMoreOpen(false)}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

export default AppLayout;
