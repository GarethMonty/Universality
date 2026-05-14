import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN_PATTERNS = [
  [/docker\s+compose|docker\s+exec|docker\s+run/, 'CI must not start Docker fixtures'],
  [/fixtures:(up|seed|down|up:all|seed:all|up:profile)/, 'CI must not run fixture scripts'],
  [/check:e2e|e2e:desktop|tauri-driver|webdriverio/i, 'CI must not run desktop E2E'],
  [/DATANAUT_FIXTURE_RUN:\s*['"]1['"]/, 'CI must not enable fixture-backed tests'],
  [/npm\s+run\s+tauri:build|tauri\s+build/, 'CI must not build release desktop bundles'],
  [/adapter-integration-linux|desktop-e2e-linux|native-smoke/, 'CI must not define external-dependency jobs'],
]

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) {
    throw new Error(message)
  }
}

export function validateCiWorkflow(repoRoot = process.cwd()) {
  const path = resolve(repoRoot, '.github/workflows/ci.yml')
  const text = readFileSync(path, 'utf8')

  requireMatch(text, /^on:\s*$/m, 'ci.yml must define workflow triggers')
  requireMatch(text, /^\s*pull_request:\s*$/m, 'ci.yml must run on pull requests')
  requireMatch(text, /^\s*push:\s*$/m, 'ci.yml must run on pushes')
  requireMatch(text, /^\s*workflow_dispatch:\s*$/m, 'ci.yml must support manual runs')
  requireMatch(text, /^\s*contents:\s*read\s*$/m, 'ci.yml must use read-only contents permissions')
  requireMatch(
    text,
    /Unit and dependency-free integration tests/,
    'ci.yml should describe its dependency-free CI scope',
  )
  requireMatch(text, /DATANAUT_FIXTURE_RUN:\s*['"]0['"]/, 'ci.yml must explicitly disable fixtures')
  requireMatch(text, /npm\s+run\s+ci:test/, 'ci.yml must run the shared deterministic CI script')

  for (const [pattern, message] of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(message)
    }
  }

  return { path }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = validateCiWorkflow(process.cwd())
    console.log(`CI workflow OK: ${result.path}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
