import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        username,
        password,
        email: email.trim() || undefined,
      });
      // Auth context will update, App will redirect to dashboard
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const passwordsMatch = password === confirmPassword || confirmPassword === '';
  const passwordRules = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordValid = passwordRules.every((r) => r.ok);
  const formValid = username.trim().length >= 2 && passwordValid && passwordsMatch;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl text-heading">Create Account</h1>
          <p className="mt-1 text-sm text-muted">Join your household organizer</p>
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
            Username *
            <input
              type="text"
              className="rounded-card border border-th-border px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              minLength={2}
              maxLength={40}
              pattern="^[a-zA-Z0-9_ -]+$"
              title="Letters, numbers, spaces, hyphens, and underscores only"
            />
            <span className="text-xs font-normal text-faint">
              2–40 characters, letters, numbers, spaces, hyphens, underscores
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
            Email
            <input
              type="email"
              className="rounded-card border border-th-border px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="Optional"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
            Password *
            <input
              type="password"
              className="rounded-card border border-th-border px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
            {password.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {passwordRules.map((r) => (
                  <li key={r.label} className={`text-xs ${r.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {r.ok ? '✓' : '✗'} {r.label}
                  </li>
                ))}
              </ul>
            )}
            {password.length === 0 && (
              <span className="text-xs font-normal text-faint">
                Min 8 chars · uppercase · lowercase · number · special character
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
            Confirm password *
            <input
              type="password"
              className={`rounded-card border px-3 py-2 text-sm ${
                !passwordsMatch ? 'border-red-300' : 'border-th-border'
              }`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {!passwordsMatch && (
              <span className="text-xs font-normal text-red-600">Passwords do not match</span>
            )}
          </label>

          <button
            type="submit"
            className="w-full rounded-full bg-btn-primary py-2.5 text-sm font-semibold text-btn-primary-text disabled:opacity-50"
            disabled={submitting || !formValid}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-heading underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
