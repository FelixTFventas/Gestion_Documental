import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 120000,
  expect: { timeout: 15000 },
  use: { channel: 'chromium', actionTimeout: 15000, baseURL: process.env.APP_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: process.env.APP_URL || 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120000 }
});
