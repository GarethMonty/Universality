import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function readJsonVersion(repoRoot, path) {
  const value = JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')).version
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} does not contain a string version`)
  }
  return value
}

function readCargoPackageVersion(repoRoot, path) {
  const text = readFileSync(resolve(repoRoot, path), 'utf8')
  let inPackageSection = false

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      inPackageSection = /^\s*\[package\]\s*$/.test(line)
      continue
    }

    if (inPackageSection) {
      const version = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/)
      if (version) {
        return version[1]
      }
    }
  }

  throw new Error(`${path} [package] section does not contain a version`)
}

function readCargoLockPackageVersion(repoRoot, path, packageName) {
  const text = readFileSync(resolve(repoRoot, path), 'utf8')
  let inPackage = false
  let foundPackage = false

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[\[package\]\]\s*$/.test(line)) {
      inPackage = true
      foundPackage = false
      continue
    }

    if (!inPackage) {
      continue
    }

    const name = line.match(/^\s*name\s*=\s*"([^"]+)"\s*$/)
    if (name) {
      foundPackage = name[1] === packageName
      continue
    }

    if (foundPackage) {
      const version = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/)
      if (version) {
        return version[1]
      }
    }
  }

  throw new Error(`${path} does not contain package ${packageName}`)
}

function readPackageLockVersion(repoRoot, packagePath, label) {
  const lock = JSON.parse(readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'))
  const version =
    packagePath === null
      ? lock.version
      : lock.packages && lock.packages[packagePath] && lock.packages[packagePath].version

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`package-lock.json does not contain a string version for ${label}`)
  }

  return version
}

export function isValidReleaseVersion(version) {
  return SEMVER_PATTERN.test(version)
}

export function readReleaseVersions(repoRoot = process.cwd()) {
  return [
    {
      name: 'root package.json',
      path: 'package.json',
      version: readJsonVersion(repoRoot, 'package.json')
    },
    {
      name: 'desktop package.json',
      path: 'apps/desktop/package.json',
      version: readJsonVersion(repoRoot, 'apps/desktop/package.json')
    },
    {
      name: 'shared types package.json',
      path: 'packages/shared-types/package.json',
      version: readJsonVersion(repoRoot, 'packages/shared-types/package.json')
    },
    {
      name: 'package-lock root',
      path: 'package-lock.json#version',
      version: readPackageLockVersion(repoRoot, null, 'root')
    },
    {
      name: 'package-lock workspace root',
      path: 'package-lock.json#packages[""]',
      version: readPackageLockVersion(repoRoot, '', 'workspace root')
    },
    {
      name: 'package-lock desktop',
      path: 'package-lock.json#packages["apps/desktop"]',
      version: readPackageLockVersion(repoRoot, 'apps/desktop', 'apps/desktop')
    },
    {
      name: 'package-lock shared types',
      path: 'package-lock.json#packages["packages/shared-types"]',
      version: readPackageLockVersion(
        repoRoot,
        'packages/shared-types',
        'packages/shared-types'
      )
    },
    {
      name: 'desktop Cargo.toml',
      path: 'apps/desktop/src-tauri/Cargo.toml',
      version: readCargoPackageVersion(repoRoot, 'apps/desktop/src-tauri/Cargo.toml')
    },
    {
      name: 'desktop Cargo.lock',
      path: 'apps/desktop/src-tauri/Cargo.lock#datanaut-desktop',
      version: readCargoLockPackageVersion(
        repoRoot,
        'apps/desktop/src-tauri/Cargo.lock',
        'datanaut-desktop'
      )
    },
    {
      name: 'desktop tauri.conf.json',
      path: 'apps/desktop/src-tauri/tauri.conf.json',
      version: readJsonVersion(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json')
    }
  ]
}

export function validateReleaseVersion(version, repoRoot = process.cwd()) {
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('Release version is required')
  }

  const normalizedVersion = version.trim()
  if (!isValidReleaseVersion(normalizedVersion)) {
    throw new Error(
      `Release version "${version}" must be semver like 1.2.3 or 1.2.3-beta.1`
    )
  }

  const versions = readReleaseVersions(repoRoot)
  const mismatches = versions.filter((entry) => entry.version !== normalizedVersion)
  if (mismatches.length > 0) {
    const details = mismatches
      .map((entry) => `${entry.path}: expected ${normalizedVersion}, found ${entry.version}`)
      .join('\n')
    throw new Error(`Release version files do not match:\n${details}`)
  }

  return {
    version: normalizedVersion,
    tagName: `app-v${normalizedVersion}`,
    prerelease: normalizedVersion.includes('-'),
    files: versions
  }
}

function parseArgs(argv) {
  const args = [...argv]
  const repoRootFlag = args.indexOf('--repo-root')
  let repoRoot = process.cwd()

  if (repoRootFlag !== -1) {
    repoRoot = resolve(args[repoRootFlag + 1] ?? '')
    args.splice(repoRootFlag, 2)
  }

  return {
    version: args[0],
    repoRoot
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { version, repoRoot } = parseArgs(process.argv.slice(2))
    const result = validateReleaseVersion(version, repoRoot)
    console.log(`Release version OK: ${result.version}`)
    console.log(`Release tag: ${result.tagName}`)
    console.log(`Prerelease: ${result.prerelease}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
