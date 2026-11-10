'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="standalone-message"><h1>No pudimos abrir el archivo</h1><p>Comprueba que la base de datos esté disponible y las migraciones estén aplicadas.</p><button className="button primary" onClick={reset}>Volver a intentar</button></div>; }
