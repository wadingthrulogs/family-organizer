import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ username, password });
      // Auth context will update, App will redirect to dashboard
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Login failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl text-heading">Family Organizer</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your household</p>
        </div>

        <form
          className="rounded-card border border-th-border bg-card p-6 shadow-soft space-y-4"
          onSubmit={handleSubmit}
        >
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
            Username
            <input
              type="text"
              className="rounded-card border border-th-border px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
            Password
            <input
              type="password"
              className="rounded-card border border-th-border px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-full bg-btn-primary py-2.5 text-sm font-semibold text-btn-primary-text disabled:opacity-50"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  );
}

export default LoginPage;
