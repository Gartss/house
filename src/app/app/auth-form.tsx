'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ErrorNotice from '@/components/error-notice';
import { errorMessage } from '@/lib/error-message';
export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword: confirm }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      location.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="welcome auth-card">
      <h2>{mode === 'login' ? '登录房得 Find' : '注册房得 Find 账号'}</h2>
      <form onSubmit={submit}>
        <label>
          账号
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          密码
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
          />
        </label>
        {mode === 'register' && (
          <label>
            确认密码
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && <ErrorNotice compact>{error}</ErrorNotice>}
        <Button type="submit" disabled={busy}>
          {mode === 'login' ? '登录' : '注册并登录'}
        </Button>
      </form>
      <button
        className="auth-switch"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
        }}
      >
        {mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录'}
      </button>
    </section>
  );
}
