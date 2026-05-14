import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_PLATFORMS = [
  'ubuntu-22.04',
  'windows-latest',
  'macos-13',
  'macos-latest'
]

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) {
    throw new Error(message)
  }
}

export function validateReleaseWorkflow(repoRoot = process.cwd()) {
  const path = resolve(repoRoot, '.github/workflows/release.yml')
  const text = readFileSync(path, 'utf8')

  requireMatch(text, /^\s*workflow_dispatch:\s*$/m, 'release.yml must use workflow_dispatch')
  requireMatch(text, /^\s*version:\s*$/m, 'release.yml must define a version input')
  requireMatch(text, /^\s*required:\s*true\s*$/m, 'release version input must be required')
  requireMatch(text, /^\s*contents:\s*write\s*$/m, 'release workflow must grant contents: write')
  requireMatch(
    text,
    /tauri-apps\/tauri-action@v0/,
    'release workflow must use tauri-apps/tauri-action@v0'
  )
  requireMatch(text, /projectPath:\s*apps\/desktop/, 'release workflow must set projectPath')
  requireMatch(
    text,
    /tagName:\s*app-v\$\{\{\s*inputs\.version\s*\}\}/,
    'release workflow must tag releases from the manual version input'
  )
  requireMatch(text, /releaseDraft:\s*true/, 'release workflow must create draft releases')
  requireMatch(
    text,
    /prerelease:\s*\$\{\{\s*contains\(inputs\.version,\s*'-'\)\s*\}\}/,
    'release workflow must mark prerelease versions from semver prerelease input'
  )
  requireMatch(
    text,
    /npm\s+run\s+release:validate\s+--\s+"\$\{\{\s*inputs\.version\s*\}\}"/,
    'release workflow must run the shared release version validator'
  )
  requireMatch(
    text,
    /npm\s+run\s+release:bump\s+--\s+"\$\{\{\s*inputs\.version\s*\}\}"/,
    'release workflow must auto-update release version files'
  )
  requireMatch(
    text,
    /release-sha:\s*\$\{\{\s*steps\.release\.outputs\.release_sha\s*\}\}/,
    'release workflow must expose the committed release SHA'
  )
  requireMatch(
    text,
    /ref:\s*\$\{\{\s*needs\.validate\.outputs\.release-sha\s*\}\}/,
    'release workflow publish jobs must check out the committed release SHA'
  )

  for (const platform of REQUIRED_PLATFORMS) {
    requireMatch(
      text,
      new RegExp(`platform:\\s*${platform.replaceAll('.', '\\.')}`),
      `release workflow is missing ${platform}`
    )
  }

  return {
    path,
    platforms: REQUIRED_PLATFORMS
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = validateReleaseWorkflow(process.cwd())
    console.log(`Release workflow OK: ${result.path}`)
    console.log(`Platforms: ${result.platforms.join(', ')}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
