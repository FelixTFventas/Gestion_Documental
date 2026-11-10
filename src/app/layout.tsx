import type { Metadata } from 'next';
import './globals.css';
import './workflow.css';
export const metadata: Metadata = { title: { default: 'Gestión documental · Félix Trujillo Falla', template: '%s · FTF Documental' }, description: 'Archivo y circulación interna de documentos de Félix Trujillo Falla Inmobiliaria', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="es"><head><link rel="stylesheet" href="/fonts/fonts.css" /></head><body>{children}</body></html>; }
