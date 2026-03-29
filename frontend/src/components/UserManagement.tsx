import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  fetchUsers,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  createUser,
  changePassword,
  type UserListItem,
} from '../api/auth';
import { StatusBadge, statusColors } from './ui/StatusBadge';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  // Reset password modal state (admin: reset another user)
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Change own password modal state
  const [showChangePw, setShowChangePw] = useState(false);
  const [changePwCurrent, setChangePwCurrent] = useState('');
  const [changePwNew, setChangePwNew] = useState('');
  const [changePwChanging, setChangePwChanging] = useState(false);

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [creating, setCreating] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchUsers();
      setUsers(result.items);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: number, role: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    try {
      setNotice(null);
      await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      setNotice({ tone: 'success', message: 'Role updated successfully.' });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Failed to update role.';
      setNotice({ tone: 'error', message: msg });
    }
  };

  const handleDelete = async (target: UserListItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${target.username}"? This action can't be undone.`
    );
    if (!confirmed) return;

    try {
      setNotice(null);
      await deleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setNotice({ tone: 'success', message: `User "${target.username}" deleted.` });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Failed to delete user.';
      setNotice({ tone: 'error', message: msg });
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) return;
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.id, newPassword);
      setNotice({ tone: 'success', message: `Password for "${resetTarget.username}" reset successfully.` });
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Failed to reset password.';
      setNotice({ tone: 'error', message: msg });
    } finally {
      setResetting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!usernameValid(createUsername) || !passwordMeetsComplexity(createPassword)) return;
    if (createEmail && !emailValid(createEmail)) return;
    setCreating(true);
    try {
      await createUser({
        username: createUsername,
        password: createPassword,
        email: createEmail || undefined,
        role: createRole,
      });
      setNotice({ tone: 'success', message: `User "${createUsername}" created successfully.` });
      setShowCreate(false);
      setCreateUsername('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('MEMBER');
      loadUsers();
    } catch (err) {
      const errData = (err as { response?: { data?: { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } } } })?.response?.data?.error;
      const fieldErrors = errData?.details?.fieldErrors;
      const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      const msg = firstFieldError ?? errData?.message ?? 'Failed to create user.';
      setNotice({ tone: 'error', message: msg });
    } finally {
      setCreating(false);
    }
  };

  const handleChangeOwnPassword = async () => {
    if (!changePwCurrent || !changePwNew) return;
    setChangePwChanging(true);
    try {
      await changePassword({ currentPassword: changePwCurrent, newPassword: changePwNew });
      setNotice({ tone: 'success', message: 'Password changed successfully.' });
      setShowChangePw(false);
      setChangePwCurrent('');
      setChangePwNew('');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (code === 'WRONG_PASSWORD') {
        setNotice({ tone: 'error', message: 'Current password is incorrect.' });
      } else {
        setNotice({ tone: 'error', message: message ?? 'Failed to change password.' });
      }
    } finally {
      setChangePwChanging(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-th-border-light pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-heading">{isAdmin ? 'User Management' : 'Account'}</h2>
          <p className="text-sm text-muted">
            {isAdmin ? 'View, edit roles, reset passwords, or remove household members.' : 'Manage your account password.'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full bg-btn-primary px-4 py-1.5 text-xs font-semibold text-btn-primary-text"
              onClick={() => {
                setShowCreate(true);
                setNotice(null);
              }}
            >
              + Create User
            </button>
            <button
              type="button"
              className="rounded-full border border-th-border px-4 py-1.5 text-xs font-semibold text-secondary hover:bg-hover-bg"
              onClick={loadUsers}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`mb-4 rounded border px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {notice.message}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold"
            onClick={loadUsers}
          >
            Retry
          </button>
        </div>
      )}

      {!isAdmin ? (
        <div className="flex items-center gap-3 rounded-card border border-th-border-light px-3 py-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: currentUser.colorHex ?? '#64748b' }}
          >
            {currentUser.username.charAt(0).toUpperCase()}
          </span>
          <span className="font-medium text-heading flex-1">{currentUser.username}</span>
          <button
            type="button"
            className="rounded border border-th-border px-2.5 py-1 text-xs text-secondary hover:bg-hover-bg"
            onClick={() => {
              setShowChangePw(true);
              setNotice(null);
            }}
          >
            Change PW
          </button>
        </div>
      ) : loading && users.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-hover-bg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-th-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Last Login</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border-light">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-hover-bg">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: u.colorHex ?? '#64748b' }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-heading">
                          {u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-xs text-faint">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">{u.email ?? '—'}</td>
                    <td className="px-3 py-3">
                      {isSelf ? (
                        <StatusBadge status={u.role} />
                      ) : (
                        <select
                          className={`rounded border px-2 py-1 text-xs font-semibold ${statusColors(u.role)}`}
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')
                          }
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Member</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-3 py-3 text-muted">{formatDate(u.createdAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSelf ? (
                          <button
                            type="button"
                            className="rounded border border-th-border px-2.5 py-1 text-xs text-secondary hover:bg-hover-bg"
                            onClick={() => {
                              setShowChangePw(true);
                              setNotice(null);
                            }}
                            title="Change your password"
                          >
                            Change PW
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rounded border border-th-border px-2.5 py-1 text-xs text-secondary hover:bg-hover-bg"
                              onClick={() => {
                                setResetTarget(u);
                                setNewPassword('');
                                setNotice(null);
                              }}
                              title="Reset password"
                            >
                              Reset PW
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(u)}
                              title="Delete user"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Change Own Password Modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-heading">Change Your Password</h3>
            <p className="mt-1 text-sm text-muted">
              Enter your current password and a new one (min 8 characters with uppercase, lowercase, number, and special character).
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                placeholder="Current password"
                value={changePwCurrent}
                onChange={(e) => setChangePwCurrent(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <input
                type="password"
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                placeholder="New password"
                value={changePwNew}
                onChange={(e) => setChangePwNew(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-th-border px-4 py-2 text-sm"
                onClick={() => {
                  setShowChangePw(false);
                  setChangePwCurrent('');
                  setChangePwNew('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
                disabled={!changePwCurrent || changePwNew.length < 8 || changePwChanging}
                onClick={handleChangeOwnPassword}
              >
                {changePwChanging ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-heading">
              Reset Password for "{resetTarget.username}"
            </h3>
            <p className="mt-1 text-sm text-muted">
              Enter a new password (min 8 characters). The user will need to use this password on their next login.
            </p>
            <input
              type="password"
              className="mt-4 w-full rounded-lg border border-th-border px-3 py-2 text-sm"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-th-border px-4 py-2 text-sm"
                onClick={() => {
                  setResetTarget(null);
                  setNewPassword('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
                disabled={newPassword.length < 8 || resetting}
                onClick={handleResetPassword}
              >
                {resetting ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-heading">Create New User</h3>
            <p className="mt-1 text-sm text-muted">
              Add a new household member. Password must be at least 8 characters with uppercase, lowercase, number, and special character.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                placeholder="Username *"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                autoFocus
              />
              <input
                type="email"
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                placeholder="Email (optional)"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
              <input
                type="password"
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                placeholder="Password *"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
              <select
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-th-border px-4 py-2 text-sm"
                onClick={() => {
                  setShowCreate(false);
                  setCreateUsername('');
                  setCreateEmail('');
                  setCreatePassword('');
                  setCreateRole('MEMBER');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
                disabled={!usernameValid(createUsername) || !passwordMeetsComplexity(createPassword) || (createEmail !== '' && !emailValid(createEmail)) || creating}
                onClick={handleCreateUser}
              >
                {creating ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function usernameValid(username: string): boolean {
  return username.trim().length >= 2 && username.trim().length <= 40 && /^[a-zA-Z0-9_ -]+$/.test(username.trim());
}

function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordMeetsComplexity(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}
