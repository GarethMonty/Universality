import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isValidReleaseVersion,
  validateReleaseVersion
} from './validate-release-version.mjs'
import { validateReleaseWorkflow } from './validate-release-workflow.mjs'

function makeRepo(version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'universality-release-'))
  mkdirSync(join(root, 'apps', 'desktop', 'src-tauri'), { recursive: true })

  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'universality', version }, null, 2)
  )
  writeFileSync(
    join(root, 'apps', 'desktop', 'package.json'),
    JSON.stringify({ name: '@universality/desktop', version }, null, 2)
  )
  writeFileSync(
    join(root, 'apps', 'desktop', 'src-tauri', 'Cargo.toml'),
    `[package]\nname = "universality-desktop"\nversion = "${version}"\nedition = "2021"\n`
  )
  writeFileSync(
    join(root, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({ productName: 'Universality', version }, null, 2)
  )

  return root
}

test('accepts matching stable versions', () => {
  const result = validateReleaseVersion('1.2.3', makeRepo('1.2.3'))

  assert.equal(result.version, '1.2.3')
  assert.equal(result.tagName, 'app-v1.2.3')
  assert.equal(result.prerelease, false)
  assert.equal(result.files.length, 4)
})

test('accepts matching prerelease versions', () => {
  const result = validateReleaseVersion('2.0.0-beta.1', makeRepo('2.0.0-beta.1'))

  assert.equal(result.version, '2.0.0-beta.1')
  assert.equal(result.tagName, 'app-v2.0.0-beta.1')
  assert.equal(result.prerelease, true)
})

test('rejects missing versions', () => {
  assert.throws(() => validateReleaseVersion('', makeRepo()), /required/)
})

test('rejects invalid semver input', () => {
  for (const version of ['1', '1.2', '01.2.3', '1.2.3+build.1', 'v1.2.3']) {
    assert.equal(isValidReleaseVersion(version), false)
    assert.throws(() => validateReleaseVersion(version, makeRepo()), /must be semver/)
  }
})

test('rejects mismatched version files', () => {
  assert.throws(
    () => validateReleaseVersion('1.2.3', makeRepo('1.2.4')),
    /Release version files do not match/
  )
})

test('current release workflow matches the hardened release contract', () => {
  const result = validateReleaseWorkflow(process.cwd())

  assert.deepEqual(result.platforms, [
    'ubuntu-22.04',
    'windows-latest',
    'macos-13',
    'macos-latest'
  ])
})
