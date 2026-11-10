import Link from 'next/link';
import { Archive, ArrowDownLeft, ArrowUpRight, FolderOpen, LayoutGrid, Plus, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';
import { AREAS, type User } from '@/lib/types';
import { SignOut } from './sign-out';
export function Shell({ user, children, active }: { user: User; children: React.ReactNode; active?: string }) {
  const links: [string, string, string, LucideIcon][] = [
    ['inbox', '/?tab=inbox', 'Por atender', ArrowDownLeft],
    ['sent', '/?tab=sent', 'Enviados', ArrowUpRight],
    ['mine', '/?tab=mine', 'Documentos de mi área', FolderOpen],
  ];
  if (user.area_id === 'gerencia') links.push(['all', '/?tab=all', 'Vista general', LayoutGrid]);
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Inicio"><img src="/logo.png" alt="Félix Trujillo Falla Inmobiliaria, desde 1945" /><span>GESTIÓN DOCUMENTAL</span></Link>
      {user.area_id && <Link href="/documents/new" className="button primary new-doc"><Plus size={18} /> Nuevo documento</Link>}
      <div className="nav-label">ESPACIO DE TRABAJO</div>
      <nav>{links.map(([key, url, label, Icon]) => <Link href={url} key={key} className={`nav-item ${active === key ? 'active' : ''}`}><Icon size={19} /><span>{label}</span></Link>)}
        {(user.is_admin || user.area_id === 'gerencia') && <Link href="/admin" className={`nav-item ${active === 'admin' ? 'active' : ''}`}><Settings size={19} />Usuarios y permisos</Link>}
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={20} /><div><strong>Archivo interno</strong><span>Acceso privado por área</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="workspace-label"><Archive size={18} /><span>Archivo institucional</span><span className="separator">/</span><strong>{user.area_id ? AREAS[user.area_id] : 'Administración de usuarios'}</strong></div><div className="account"><span className="avatar">{user.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</span><div><strong>{user.name}</strong><small>{user.is_admin ? 'Administración · ' : ''}{user.area_id ? AREAS[user.area_id] : 'Sin acceso documental'}</small></div><SignOut /></div></header>
      <main>{children}</main>
      <footer className="app-footer"><span>Félix Trujillo Falla Inmobiliaria</span><span>Gestión documental · Uso interno</span></footer>
    </div>
  </div>;
}
