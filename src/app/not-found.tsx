import Link from 'next/link';
export default function NotFound() { return <div className="standalone-message"><span className="eyebrow">ACCESO PRIVADO</span><h1>Documento no disponible</h1><p>No existe o tu área no tiene permiso para consultarlo.</p><Link className="button primary" href="/">Volver al archivo</Link></div>; }
