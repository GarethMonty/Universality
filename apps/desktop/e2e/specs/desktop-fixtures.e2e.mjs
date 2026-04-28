import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'

const sqliteFixture =
  process.env.UNIVERSALITY_SQLITE_FIXTURE ??
  'tests/fixtures/sqlite/universality.sqlite3'
const generatedFixtureEnv = readGeneratedFixtureEnv()

function readGeneratedFixtureEnv() {
  const path = 'tests/fixtures/.generated.env'

  if (!existsSync(path)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  )
}

function fixturePort(envKey, defaultPort) {
  return process.env[envKey] ?? generatedFixtureEnv[envKey] ?? defaultPort
}

function fixtureProfileEnabled(profile) {
  return (process.env.UNIVERSALITY_FIXTURE_PROFILE ?? '')
    .split(',')
    .map((item) => item.trim())
    .some((item) => item === 'all' || item === profile)
}

const CORE_CONNECTIONS = [
  {
    name: 'Fixture PostgreSQL',
    engine: 'postgresql',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_POSTGRES_PORT', '54329'),
    database: 'universality',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'row(s) returned from Fixture PostgreSQL',
  },
  {
    name: 'Fixture SQL Server',
    engine: 'sqlserver',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_SQLSERVER_PORT', '14333'),
    database: 'universality',
    username: 'sa',
    secret: 'Universality_pwd_123',
    expectedResult: 'row(s) returned from Fixture SQL Server',
  },
  {
    name: 'Fixture MySQL',
    engine: 'mysql',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_MYSQL_PORT', '33060'),
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
    port: fixturePort('UNIVERSALITY_MONGODB_PORT', '27018'),
    database: 'catalog',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'document(s) returned from Fixture MongoDB',
  },
  {
    name: 'Fixture Redis',
    engine: 'redis',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_REDIS_PORT', '6380'),
    database: '',
    username: '',
    secret: '',
    expectedResult: 'Redis scan returned',
  },
]

const PROFILE_CONNECTIONS = [
  {
    profile: 'cache',
    name: 'Fixture Valkey',
    engine: 'valkey',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_VALKEY_PORT', '6381'),
    database: '0',
    username: '',
    secret: '',
    expectedResult: 'Redis scan returned',
  },
  {
    profile: 'cache',
    name: 'Fixture Memcached',
    engine: 'memcached',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_MEMCACHED_PORT', '11212'),
    database: '',
    username: '',
    secret: '',
    expectedResult: 'Memcached stats returned',
  },
  {
    profile: 'sqlplus',
    name: 'Fixture MariaDB',
    engine: 'mariadb',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_MARIADB_PORT', '33061'),
    database: 'commerce',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'row(s) returned from Fixture MariaDB',
  },
  {
    profile: 'sqlplus',
    name: 'Fixture CockroachDB',
    engine: 'cockroachdb',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_COCKROACH_PORT', '26257'),
    database: 'universality',
    username: 'root',
    secret: '',
    expectedResult: 'row(s) returned from Fixture CockroachDB',
  },
  {
    profile: 'sqlplus',
    name: 'Fixture TimescaleDB',
    engine: 'timescaledb',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_TIMESCALE_PORT', '54330'),
    database: 'metrics',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'row(s) returned from Fixture TimescaleDB',
  },
  {
    profile: 'analytics',
    name: 'Fixture ClickHouse',
    engine: 'clickhouse',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_CLICKHOUSE_HTTP_PORT', '8124'),
    database: 'analytics',
    username: 'universality',
    secret: 'universality',
    expectedResult: 'ClickHouse query returned',
  },
  {
    profile: 'analytics',
    name: 'Fixture Prometheus',
    engine: 'prometheus',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_PROMETHEUS_PORT', '9091'),
    database: '',
    username: '',
    secret: '',
    expectedResult: 'Prometheus vector query returned',
  },
  {
    profile: 'search',
    name: 'Fixture OpenSearch',
    engine: 'opensearch',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_OPENSEARCH_PORT', '9201'),
    database: '',
    username: '',
    secret: '',
    expectedResult: 'OpenSearch search returned',
  },
  {
    profile: 'search',
    name: 'Fixture Elasticsearch',
    engine: 'elasticsearch',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_ELASTICSEARCH_PORT', '9202'),
    database: '',
    username: '',
    secret: '',
    expectedResult: 'Elasticsearch search returned',
  },
  {
    profile: 'graph',
    name: 'Fixture Neo4j',
    engine: 'neo4j',
    server: '127.0.0.1',
    port: fixturePort('UNIVERSALITY_NEO4J_HTTP_PORT', '7475'),
    database: 'neo4j',
    username: 'neo4j',
    secret: 'universality',
    expectedResult: 'Neo4j Cypher returned',
  },
]

const CONNECTIONS = [
  ...CORE_CONNECTIONS,
  ...PROFILE_CONNECTIONS.filter((connection) => fixtureProfileEnabled(connection.profile)),
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

async function clickElementByText(text) {
  const clicked = await browser.execute((targetText) => {
    const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? ''
    const candidates = [
      ...document.querySelectorAll(
        '[role="tab"], [role="treeitem"], button, [role="button"], [aria-label]',
      ),
    ]
    const exact = candidates.find((element) => {
      const accessible =
        element.getAttribute('aria-label') ??
        element.getAttribute('title') ??
        normalize(element.textContent)
      return accessible === targetText || normalize(element.textContent) === targetText
    })
    const partial =
      exact ??
      candidates.find((element) => {
        const label =
          element.getAttribute('aria-label') ??
          element.getAttribute('title') ??
          normalize(element.textContent)
        return label.includes(targetText) || normalize(element.textContent).includes(targetText)
      })

    if (!partial) {
      return false
    }

    partial.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    partial.click()
    return true
  }, text)

  assert.equal(clicked, true, `Unable to click element containing "${text}"`)
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

function seededTabTitle(connection) {
  const extensionByEngine = {
    mongodb: 'json',
    redis: 'redis',
    valkey: 'redis',
    memcached: 'txt',
    neo4j: 'cypher',
    arango: 'aql',
    janusgraph: 'gremlin',
    cassandra: 'cql',
    prometheus: 'promql',
    influxdb: 'influxql',
    opensearch: 'json',
    elasticsearch: 'json',
    dynamodb: 'json',
    neptune: 'gremlin',
  }
  return `${connection.name}.${extensionByEngine[connection.engine] ?? 'sql'}`
}

async function activateSeededFixtureTab(connection) {
  await clickElementByText(seededTabTitle(connection))
  await waitForText(connection.name)
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
  it('starts with a fixture-seeded workspace instead of demo seed data', async () => {
    for (const connection of CORE_CONNECTIONS) {
      await waitForText(connection.name)
    }

    await waitForText('Fixture PostgreSQL.sql')
    await expectNoText('Analytics Postgres')
    await expectNoText('Ops dashboard')
    await expectNoText('Redis hot key pack')
    await expectNoText('No connections yet.')
  })

  it('explores and executes against seeded MVP datastore fixtures', async () => {
    for (const connection of CONNECTIONS) {
      await activateSeededFixtureTab(connection)
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
    assert.equal(encryptedPayload.includes('fixture-token'), false)
    assert.equal(encryptedPayload.includes('"secret"'), false)
  })
})
