'use client';
import { LogOut } from 'lucide-react';
import { command } from './client';
export function SignOut() { return <button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={async () => { await command('logout'); window.location.assign('/login'); }}><LogOut size={18} /></button>; }
