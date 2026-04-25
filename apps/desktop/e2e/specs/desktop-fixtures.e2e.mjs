import { strict as assert } from 'node:assert'

const sqliteFixture =
  process.env.UNIVERSALITY_SQLITE_FIXTURE ??
  'tests/fixtures/sqlite/universality.sqlite3'

const CONNECTIONS = [
  {
    name: 'Fixture PostgreSQL',
    engine: 'postgresql',
    server: '127.0.0.1',
    port: '54329',
    database: 'universality',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'row(s) returned from Fixture PostgreSQL',
  },
  {
    name: 'Fixture SQL Server',
    engine: 'sqlserver',
    server: '127.0.0.1',
    port: '14333',
    database: 'universality',
    username: 'sa',
    secret: 'Universality_pwd_123',
    expectedResult: 'row(s) returned from Fixture SQL Server',
  },
  {
    name: 'Fixture MySQL',
    engine: 'mysql',
    server: '127.0.0.1',
    port: '33060',
    database: 'commerce',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'row(s) returned from Fixture MySQL',
  },
  {
    name: 'Fixture SQLite',
    engine: 'sqlite',
    server: 'localhost',
    database: sqliteFixture,
    username: '',
    secret: '',
    expectedResult: 'row(s) returned from Fixture SQLite',
  },
  {
    name: 'Fixture MongoDB',
    engine: 'mongodb',
    server: '127.0.0.1',
    port: '27018',
    database: 'catalog',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'document(s) returned from Fixture MongoDB',
  },
  {
    name: 'Fixture Redis',
    engine: 'redis',
    server: '127.0.0.1',
    port: '6380',
    database: '',
    username: '',
    secret: '',
    expectedResult: 'Redis scan returned',
  },
]

async function appText() {
  return browser.execute(() => document.body.innerText)
}

async function waitForText(text, timeout = 30000) {
  await browser.waitUntil(
    async () => {
      const body = await appText()
      return body.includes(text)
    },
    {
      timeout,
      timeoutMsg: `Expected desktop shell to contain "${text}"`,
    },
  )
}

async function expectNoText(text) {
  const body = await appText()
  assert.equal(body.includes(text), false, `Unexpected text found: ${text}`)
}

async function clickControl(label) {
  const clicked = await browser.execute((targetLabel) => {
    const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? ''
    const controls = [...document.querySelectorAll('button, [role="button"], [role="option"]')]
    const control = controls.find((element) => {
      const accessible =
        element.getAttribute('aria-label') ??
        element.getAttribute('title') ??
        normalize(element.textContent)
      return accessible === targetLabel || normalize(element.textContent) === targetLabel
    })

    if (!control) {
      return false
    }

    control.click()
    return true
  }, label)

  assert.equal(clicked, true, `Unable to click control "${label}"`)
}

async function setField(label, value) {
  const updated = await browser.execute(
    ({ targetLabel, nextValue }) => {
      const labels = [...document.querySelectorAll('label')]
      const labelElement = labels.find((item) => {
        const firstLine = item.innerText.split('\n')[0]?.trim()
        return firstLine === targetLabel
      })
      const field = labelElement?.querySelector('input, select, textarea')

      if (!field) {
        return false
      }

      const prototype =
        field instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
      descriptor?.set?.call(field, nextValue)
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    { targetLabel: label, nextValue: value },
  )

  assert.equal(updated, true, `Unable to set field "${label}"`)
}

async function createAndTestConnection(connection) {
  await clickControl('New connection')
  await waitForText('Connection')

  await setField('Database type', connection.engine)
  await setField('Name', connection.name)

  if (connection.engine !== 'sqlite') {
    await setField('Server', connection.server)
  }

  if (connection.port) {
    await setField('Port', connection.port)
  }

  await setField(connection.engine === 'sqlite' ? 'Database file' : 'Database', connection.database)

  if (connection.engine !== 'sqlite') {
    await setField('User name', connection.username)
  }

  if (connection.engine !== 'sqlite' && connection.secret) {
    await setField('Password / Secret', connection.secret)
  }

  await clickControl('Save Connection')
  await waitForText(connection.name)
  await clickControl('Test Connection')
  await waitForText('Connection ready', 60000)
  await clickControl('Create query tab')
  await waitForText(`${connection.name} scratch`)
}

async function runActiveQuery(connection) {
  await clickControl('Run query')
  await waitForText(connection.expectedResult, 60000)
}

async function loadExplorerForActiveConnection() {
  await clickControl('Explorer view')
  await clickControl('Refresh explorer')
  await browser.waitUntil(
    async () =>
      browser.execute(() => document.querySelectorAll('.tree-item').length > 0),
    {
      timeout: 60000,
      timeoutMsg: 'Expected explorer tree rows to load for the active connection.',
    },
  )
  await clickControl('Connections view')
}

async function exportWorkspace() {
  await clickControl('Open diagnostics drawer')
  await waitForText('Diagnostics')
  await setField('Passphrase', 'correct horse battery staple')
  await clickControl('Export')
  await browser.waitUntil(
    async () =>
      browser.execute(() => Boolean(document.querySelector('.drawer-code code')?.textContent?.trim())),
    {
      timeout: 20000,
      timeoutMsg: 'Expected encrypted export payload to be rendered.',
    },
  )

  return browser.execute(() => document.querySelector('.drawer-code code')?.textContent ?? '')
}

describe('Universality Tauri desktop fixtures', () => {
  it('starts with a blank workspace instead of demo seed data', async () => {
    await waitForText('Connect to your first datastore.')
    await waitForText('No connections yet.')
    await expectNoText('Analytics Postgres')
    await expectNoText('Ops dashboard')
    await expectNoText('Redis hot key pack')
  })

  it('creates, tests, explores, and executes against all MVP datastore fixtures', async () => {
    for (const connection of CONNECTIONS) {
      await createAndTestConnection(connection)
      await runActiveQuery(connection)
      await loadExplorerForActiveConnection()
    }
  })

  it('saves real work and exports without raw secrets', async () => {
    await clickControl('Saved Work view')
    await clickControl('Save current query')
    await waitForText('Saved Queries')

    const encryptedPayload = await exportWorkspace()
    assert.equal(encryptedPayload.includes('Universality_pwd_123'), false)
    assert.equal(encryptedPayload.includes('universality-root'), false)
    assert.equal(encryptedPayload.includes('"secret"'), false)
  })
})
