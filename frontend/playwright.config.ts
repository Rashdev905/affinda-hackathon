import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const python = resolve('..', 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
  webServer: [
    { command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8001`, cwd: '../backend', url: 'http://127.0.0.1:8001/health', reuseExistingServer: false, env: { PULSE_DB_PATH: resolve('..', '.run', `e2e-${process.pid}.db`) } },
    { command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174`, url: 'http://127.0.0.1:5174', reuseExistingServer: false, env: { PULSE_API_TARGET: 'http://127.0.0.1:8001' } },
  ],
})

