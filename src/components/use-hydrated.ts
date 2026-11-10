'use client';
import { useEffect, useState } from 'react';

// Evita enviar formularios SSR antes de que estén instalados sus controladores.
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
