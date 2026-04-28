import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const defaultMaxLines = 400

const documentedExceptions = new Map(
  [
    ['apps/desktop/src/app/components/workbench/SideBar.tsx', 2300, 'legacy sidebar pending area split'],
    ['apps/desktop/src/app/components/workbench/RightDrawer.tsx', 1600, 'legacy drawer pending area split'],
    ['apps/desktop/src-tauri/src/app/runtime.rs', 3700, 'legacy runtime shell pending command split'],
  ].map(([file, maxLines, reason]) => [file, { maxLines, reason }]),
)

test('workbench and runtime modules stay within documented size budgets', async () => {
  const files = [
    ...(await sourceFiles('apps/desktop/src/app/components/workbench', ['.ts', '.tsx'])),
    ...(await sourceFiles('apps/desktop/src-tauri/src/app', ['.rs'])),
  ].filter((file) => !file.includes('.test.') && !file.endsWith('/mod.rs'))

  const failures = []

  for (const file of files) {
    const relativePath = normalizePath(path.relative(repoRoot, file))
    const lines = lineCount(await readFile(file, 'utf8'))
    const exception = documentedExceptions.get(relativePath)
    const limit = exception?.maxLines ?? defaultMaxLines

    if (exception) {
      assert.ok(exception.reason, `${relativePath} needs a documented exception reason`)
    }

    if (lines > limit) {
      failures.push(`${relativePath}: ${lines} lines exceeds ${limit}`)
    }
  }

  assert.deepEqual(failures, [])
})

async function sourceFiles(root, extensions) {
  const rootPath = path.join(repoRoot, root)
  const entries = await readdir(rootPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootPath, entry.name)

      if (entry.isDirectory()) {
        return sourceFiles(path.relative(repoRoot, fullPath), extensions)
      }

      return extensions.includes(path.extname(entry.name)) ? [fullPath] : []
    }),
  )

  return files.flat()
}

function lineCount(contents) {
  return contents.split(/\r?\n/).length
}

function normalizePath(file) {
  return file.split(path.sep).join('/')
}
