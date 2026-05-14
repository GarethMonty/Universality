import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import waitOn from 'wait-on'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const driverExecutable = process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver'
const cargoDriverBin = join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin', driverExecutable)
const driverBin =
  process.env.DATAPADPLUSPLUS_TAURI_DRIVER_BIN ??
  (existsSync(cargoDriverBin) ? cargoDriverBin : 'tauri-driver')
const driverPort = process.env.DATAPADPLUSPLUS_TAURI_DRIVER_PORT ?? '4444'
const nativeDriverBin = process.env.DATAPADPLUSPLUS_NATIVE_WEBDRIVER_BIN
const workspaceDir =
  process.env.DATAPADPLUSPLUS_WORKSPACE_DIR ??
  mkdtempSync(join(tmpdir(), 'datapadplusplus-e2e-workspace-'))

function candidateBinaries() {
  const releaseDir = resolve(repoRoot, 'apps', 'desktop', 'src-tauri', 'target', 'release')

  if (process.platform === 'win32') {
    return [
      join(releaseDir, 'datapadplusplus-desktop.exe'),
      join(releaseDir, 'DataPad++.exe'),
    ]
  }

  if (process.platform === 'darwin') {
    return [
      join(releaseDir, 'bundle', 'macos', 'DataPad++.app'),
      join(releaseDir, 'datapadplusplus-desktop'),
    ]
  }

  return [
    join(releaseDir, 'datapadplusplus-desktop'),
    join(releaseDir, 'bundle', 'appimage', 'DataPad++.AppImage'),
  ]
}

function resolveApplicationBinary() {
  if (process.env.DATAPADPLUSPLUS_DESKTOP_BINARY) {
    return resolve(process.env.DATAPADPLUSPLUS_DESKTOP_BINARY)
  }

  const binary = candidateBinaries().find((candidate) => existsSync(candidate))

  if (!binary) {
    throw new Error(
      [
        'Unable to find a built DataPad++ desktop binary.',
        'Run `npm run tauri:build` first or set DATAPADPLUSPLUS_DESKTOP_BINARY.',
      ].join(' '),
    )
  }

  return binary
}

function ensureTauriDriver() {
  const probe = spawnSync(driverBin, ['--help'], {
    encoding: 'utf8',
    stdio: 'ignore',
    shell: false,
  })

  if (probe.status !== 0) {
    throw new Error(
      'tauri-driver is required for desktop E2E. Install it with `cargo install tauri-driver --locked` or set DATAPADPLUSPLUS_TAURI_DRIVER_BIN.',
    )
  }
}

function runWdio(application) {
  const result = spawnSync(
    npm,
    ['exec', '--workspace', '@datapadplusplus/desktop', '--', 'wdio', 'run', 'apps/desktop/e2e/wdio.conf.mjs'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATAPADPLUSPLUS_DESKTOP_BINARY: application,
        DATAPADPLUSPLUS_FIXTURE_RUN: process.env.DATAPADPLUSPLUS_FIXTURE_RUN ?? '1',
        DATAPADPLUSPLUS_FIXTURE_PROFILE: process.env.DATAPADPLUSPLUS_FIXTURE_PROFILE ?? '',
        DATAPADPLUSPLUS_WORKSPACE_DIR: workspaceDir,
        DATAPADPLUSPLUS_SECRET_STORE: 'file',
        DATAPADPLUSPLUS_SECRET_FILE: join(workspaceDir, 'secrets.json'),
        DATAPADPLUSPLUS_SQLITE_FIXTURE: resolve(repoRoot, 'tests', 'fixtures', 'sqlite', 'datapadplusplus.sqlite3'),
        DATAPADPLUSPLUS_TAURI_DRIVER_PORT: driverPort,
      },
      stdio: 'inherit',
      shell: false,
    },
  )

  if (result.status !== 0) {
    throw new Error(`Desktop E2E failed with exit code ${result.status}`)
  }
}

ensureTauriDriver()
const application = resolveApplicationBinary()
const driverArgs = ['--port', driverPort]

if (nativeDriverBin) {
  driverArgs.push('--native-driver', nativeDriverBin)
}

const driver = spawn(driverBin, driverArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
})

try {
  await waitOn({
    resources: [`tcp:127.0.0.1:${driverPort}`],
    timeout: 30000,
  })
  runWdio(application)
} finally {
  driver.kill()

  if (!process.env.DATAPADPLUSPLUS_WORKSPACE_DIR) {
    rmSync(workspaceDir, { recursive: true, force: true })
  }
}
