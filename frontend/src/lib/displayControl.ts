import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Remote display control.
 *
 * `PATCH /settings/display { mode }` (from the phone, a Claude skill, the MCP)
 * records which layout the wall display should show. Only a device flagged as
 * the wall display acts on it — everyone else's browser is left alone. The
 * flag is set once by opening the app with `?wall=1` (the Tauri shell's
 * configured URL does this) and lives in localStorage.
 *
 * Each command carries a `requestedAt`; the display remembers the last one it
 * followed, so a person changing the layout by hand on the display isn't
 * overridden until the next command arrives.
 */

const WALL_FLAG = 'follow-display-commands';
const LAST_APPLIED = 'display-command-applied';
const POLL_MS = 20_000;

const ROUTES: Record<string, string> = { dashboard: '/', kiosk: '/kiosk', guest: '/guest' };

/** Call once at boot: `?wall=1` marks this device as the wall display, `?wall=0` clears it. */
export function applyWallFlagFromUrl() {
  try {
    const wall = new URLSearchParams(window.location.search).get('wall');
    if (wall === '1') localStorage.setItem(WALL_FLAG, '1');
    else if (wall === '0') localStorage.removeItem(WALL_FLAG);
  } catch {
    /* storage unavailable */
  }
}

export function isWallDisplay(): boolean {
  try {
    return localStorage.getItem(WALL_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setWallDisplay(on: boolean) {
  try {
    if (on) localStorage.setItem(WALL_FLAG, '1');
    else localStorage.removeItem(WALL_FLAG);
  } catch {
    /* storage unavailable */
  }
}

interface DisplayCommand {
  mode: 'dashboard' | 'kiosk' | 'guest';
  requestedAt: string | null;
}

export async function fetchDisplayMode(): Promise<DisplayCommand> {
  const { data } = await api.get<DisplayCommand>('/settings/display');
  return data;
}

export async function setDisplayMode(mode: DisplayCommand['mode']): Promise<DisplayCommand> {
  const { data } = await api.patch<DisplayCommand>('/settings/display', { mode });
  return data;
}

/** Mount once inside the router (signed-in area). No-op unless this is the wall display. */
export function useFollowDisplayCommands() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    if (!isWallDisplay()) return;
    let cancelled = false;

    const check = async () => {
      let cmd: DisplayCommand;
      try {
        cmd = await fetchDisplayMode();
      } catch {
        return; // offline / signed out — try again next tick
      }
      if (cancelled || !cmd.requestedAt) return;
      let last: string | null = null;
      try { last = localStorage.getItem(LAST_APPLIED); } catch { /* ignore */ }
      if (last === cmd.requestedAt) return;
      try { localStorage.setItem(LAST_APPLIED, cmd.requestedAt); } catch { /* ignore */ }
      const target = ROUTES[cmd.mode] ?? '/';
      if (pathRef.current !== target) navigate(target);
    };

    void check();
    const id = window.setInterval(check, POLL_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [navigate]);
}
