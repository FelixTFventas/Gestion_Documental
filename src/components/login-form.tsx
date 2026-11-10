'use client';
import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { command } from './client';
export function LoginForm() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    const data = new FormData(e.currentTarget);
    try { await command('login', { email: data.get('email'), password: data.get('password') }); window.location.assign('/'); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }}>
    <label>Correo electrónico<input name="email" type="email" required autoComplete="username" placeholder="nombre@inmobiliaria.com" /></label>
    <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
    {error && <div className="notice error" role="alert">{error}</div>}
    <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <>Ingresar al archivo <ArrowRight size={18} /></>}</button>
  </form>;
}
