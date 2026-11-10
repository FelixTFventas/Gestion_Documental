import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return <div className="login-layout"><section className="login-story"><div className="login-wordmark">FÉLIX TRUJILLO FALLA<span>INMOBILIARIA · DESDE 1945</span></div><div><span className="eyebrow light">ORDEN, TRAZABILIDAD Y CONFIANZA</span><h1>Cada documento,<br />en el lugar correcto.</h1><p>Un espacio para preparar, revisar y dar continuidad a nuestros trámites internos.</p></div><small>Gestión documental / Plataforma interna</small></section><section className="login-panel"><div className="login-box"><img src="/logo.png" className="login-logo" alt="Félix Trujillo Falla Inmobiliaria" /><span className="eyebrow">BIENVENIDO A TU ESPACIO</span><h2>Iniciar sesión</h2><p className="muted">Ingresa con tu cuenta individual de trabajo.</p><LoginForm /><p className="login-security">Acceso restringido al personal autorizado.<br />Las acciones del trámite quedan registradas.</p></div></section></div>;
}
