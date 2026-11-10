import Link from 'next/link';
import { Archive, ArrowDownLeft, ArrowUpRight, FolderOpen, LayoutGrid, Plus, Route, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';
import { AREAS, type DocumentCounts, type User } from '@/lib/types';
import { database } from '@/lib/db';
import { documentCounts } from '@/lib/documents';
import { SignOut } from './sign-out';

export async function Shell({ user, children, active, counts: suppliedCounts }: { user: User; children: React.ReactNode; active?: string; counts?: DocumentCounts }) {
  const counts = suppliedCounts ?? await documentCounts(await database(), user);
  const links: { key: string; label: string; icon: LucideIcon; count?: string }[] = [
    { key: 'inbox', label: 'Por atender', icon: ArrowDownLeft, count: counts.inbox },
    { key: 'circulation', label: 'En circulación', icon: Route, count: counts.circulation },
    { key: 'finished', label: 'Finalizados', icon: Archive, count: counts.finished },
    { key: 'mine', label: 'Documentos de mi área', icon: FolderOpen },
    { key: 'sent', label: 'Enviados', icon: ArrowUpRight }
  ];
  if (user.area_id === 'gerencia') links.push({ key: 'all', label: 'Vista general', icon: LayoutGrid });
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Inicio">
        <div className="brand-logo"><img src="/logo.png" alt="Félix Trujillo Falla Inmobiliaria, desde 1945" /></div>
        <span>GESTIÓN DOCUMENTAL</span>
      </Link>
      {user.area_id && <Link href="/documents/new" className="button primary new-doc"><Plus size={18} /> Nuevo documento</Link>}
      <div className="nav-label">CONTROL DEL TRÁMITE</div>
      <nav aria-label="Bandejas documentales">
        {user.area_id && links.map(({ key, label, icon: Icon, count }) => <Link href={`/?tab=${key}`} key={key} title={label} aria-label={label} aria-current={active === key ? 'page' : undefined} className={`nav-item ${active === key ? 'active' : ''}`}>
          <Icon size={20} /><span>{label}</span>{count !== undefined && <span className="nav-count" aria-hidden="true">{count}</span>}
        </Link>)}
        {(user.is_admin || user.area_id === 'gerencia') && <Link href="/admin" title="Usuarios y permisos" className={`nav-item ${active === 'admin' ? 'active' : ''}`}><Settings size={20} /><span>Usuarios y permisos</span></Link>}
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={22} /><div><strong>Archivo interno protegido</strong><span>Acceso según tu área</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="workspace-label"><Archive size={18} /><span>Archivo institucional</span><span className="separator">/</span><strong>{user.area_id ? AREAS[user.area_id] : 'Administración de usuarios'}</strong></div>
        <div className="account"><span className="avatar">{user.name.split(' ').filter(n => /^[\p{L}\p{N}]/u.test(n)).slice(0, 2).map(n => n[0]).join('')}</span><div><strong>{user.name}</strong><small>{user.is_admin ? 'Administración · ' : ''}{user.area_id ? AREAS[user.area_id] : 'Sin acceso documental'}</small></div><SignOut /></div>
      </header>
      <main>{children}</main>
      <footer className="app-footer"><span>Félix Trujillo Falla Inmobiliaria</span><span>Trazabilidad de principio a fin · Uso interno</span></footer>
    </div>
  </div>;
}
