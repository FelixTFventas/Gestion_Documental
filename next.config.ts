import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pg', '@electric-sql/pglite', '@react-pdf/renderer'],
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['./.local/**/*', './.env*', './test-results/**/*', './playwright-report/**/*'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' blob:; connect-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` }
    ] }];
  }
};
export default config;
