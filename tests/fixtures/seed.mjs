import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const requestedProfiles = new Set(
  [
    process.argv[2],
    process.env.DATAPADPLUSPLUS_FIXTURE_PROFILE,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean),
)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    shell: false,
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }

  return result.stdout ?? ''
}

function docker(args, options = {}) {
  return run('docker', args, options)
}

function containerRunning(name) {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
  })

  return result.status === 0 && result.stdout.trim() === 'true'
}

function shouldSeed(container, profile = 'core') {
  if (!containerRunning(container)) {
    return false
  }

  return (
    profile === 'core' ||
    requestedProfiles.size === 0 ||
    requestedProfiles.has('all') ||
    requestedProfiles.has(profile)
  )
}

function seedSqlWithStdin(container, command, args, scriptPath) {
  if (!containerRunning(container)) {
    return
  }

  docker(['exec', '-i', container, command, ...args], {
    input: readFileSync(scriptPath, 'utf8'),
  })
}

function redisProtocolCommand(parts) {
  return `*${parts.length}\r\n${parts
    .map((part) => {
      const value = String(part)
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`
    })
    .join('')}`
}

function seedRedisPerfKeys(container, command = 'redis-cli') {
  if (!containerRunning(container)) {
    return
  }

  const keyCount = Number.parseInt(process.env.DATAPADPLUSPLUS_REDIS_PERF_KEYS ?? '50000', 10)
  const commands = []

  commands.push(redisProtocolCommand(['DEL', 'perf:manifest']))
  commands.push(
    redisProtocolCommand([
      'HSET',
      'perf:manifest',
      'keyCount',
      String(keyCount),
      'description',
      'Synthetic keys for DataPad++ result and explorer performance tests.',
    ]),
  )

  for (let index = 1; index <= keyCount; index += 1) {
    const key = `perf:session:${String(index).padStart(6, '0')}`
    commands.push(
      redisProtocolCommand([
        'HSET',
        key,
        'userId',
        `user-${index % 10000}`,
        'region',
        ['eu-west-1', 'us-east-1', 'ap-southeast-1', 'af-south-1', 'local'][index % 5],
        'active',
        index % 3 === 0 ? '0' : '1',
        'score',
        String(index % 1000),
      ]),
    )

    if (index % 5 === 0) {
      commands.push(redisProtocolCommand(['EXPIRE', key, String(1800 + (index % 7200))]))
    }
  }

  docker(['exec', '-i', container, command, '--pipe'], {
    input: commands.join(''),
  })
}

function runPython(script) {
  const candidates = process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python']

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
      shell: false,
    })

    if (probe.status === 0) {
      run(candidate, [script])
      return
    }
  }

  throw new Error('Python 3 is required to create the SQLite fixture database.')
}

function httpRequest({ method = 'GET', port, path, body, headers = {} }) {
  const payload = body ? JSON.stringify(body) : undefined

  return new Promise((resolve, reject) => {
    const request = globalThis.fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: payload,
    })

    request
      .then(async (response) => {
        const text = await response.text()
        if (!response.ok) {
          reject(new Error(`${method} ${port}${path} failed: ${response.status} ${text}`))
          return
        }
        resolve(text)
      })
      .catch(reject)
  })
}

function tcpRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(payload)
    })
    const chunks = []
    socket.on('data', (chunk) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    socket.setTimeout(5000, () => {
      socket.destroy(new Error(`Timed out waiting for TCP fixture on port ${port}`))
    })
  })
}

async function seedCore() {
  seedSqlWithStdin(
    'datapadplusplus-postgres',
    'psql',
    ['-U', 'datapadplusplus', '-d', 'datapadplusplus'],
    join(root, 'postgres', 'init', '001_seed.sql'),
  )

  seedSqlWithStdin(
    'datapadplusplus-mysql',
    'mysql',
    ['-udatapadplusplus', '-pdatapadplusplus', 'commerce'],
    join(root, 'mysql', 'init', '001_seed.sql'),
  )

  if (containerRunning('datapadplusplus-sqlserver')) {
    docker([
      'exec',
      'datapadplusplus-sqlserver',
      '/opt/mssql-tools18/bin/sqlcmd',
      '-S',
      'localhost',
      '-U',
      'sa',
      '-P',
      'DataPadPlusPlus_pwd_123',
      '-C',
      '-i',
      '/work/001_seed.sql',
    ])
  }

  if (containerRunning('datapadplusplus-mongodb')) {
    docker([
      'exec',
      'datapadplusplus-mongodb',
      'mongosh',
      '--quiet',
      '--username',
      'datapadplusplus',
      '--password',
      'datapadplusplus',
      '--authenticationDatabase',
      'admin',
      '/docker-entrypoint-initdb.d/001_seed.js',
    ])
  }

  if (containerRunning('datapadplusplus-redis')) {
    docker([
      'exec',
      'datapadplusplus-redis',
      'redis-cli',
      'HSET',
      'session:9f2d7e1a',
      'userId',
      'a1b2c3',
      'region',
      'eu-west-1',
      'active',
      '1',
    ])
    docker(['exec', 'datapadplusplus-redis', 'redis-cli', 'EXPIRE', 'session:9f2d7e1a', '1800'])
    docker([
      'exec',
      'datapadplusplus-redis',
      'redis-cli',
      'SET',
      'cache:feature-flags',
      '{"beta":true,"region":"local"}',
    ])
    seedRedisPerfKeys('datapadplusplus-redis')
  }

  runPython(join(root, 'sqlite', 'seed.py'))
}

async function seedCache() {
  if (shouldSeed('datapadplusplus-valkey', 'cache')) {
    docker([
      'exec',
      'datapadplusplus-valkey',
      'valkey-cli',
      'HSET',
      'session:9f2d7e1a',
      'userId',
      'a1b2c3',
      'region',
      'eu-west-1',
      'active',
      '1',
    ])
    docker(['exec', 'datapadplusplus-valkey', 'valkey-cli', 'EXPIRE', 'session:9f2d7e1a', '1800'])
    seedRedisPerfKeys('datapadplusplus-valkey', 'valkey-cli')
  }

  if (shouldSeed('datapadplusplus-memcached', 'cache')) {
    await tcpRequest(
      11212,
      'set cache:feature-flags 0 3600 30\r\n{"beta":true,"region":"local"}\r\nquit\r\n',
    )
  }
}

async function seedSqlPlus() {
  if (shouldSeed('datapadplusplus-mariadb', 'sqlplus')) {
    seedSqlWithStdin(
      'datapadplusplus-mariadb',
      'mariadb',
      ['-udatapadplusplus', '-pdatapadplusplus', 'commerce'],
      join(root, 'mariadb', 'init', '001_seed.sql'),
    )
  }

  if (shouldSeed('datapadplusplus-cockroachdb', 'sqlplus')) {
    docker([
      'exec',
      'datapadplusplus-cockroachdb',
      '/cockroach/cockroach',
      'sql',
      '--insecure',
      '--file=/docker-entrypoint-initdb.d/001_seed.sql',
    ])
  }

  if (shouldSeed('datapadplusplus-timescaledb', 'sqlplus')) {
    seedSqlWithStdin(
      'datapadplusplus-timescaledb',
      'psql',
      ['-U', 'datapadplusplus', '-d', 'metrics'],
      join(root, 'timescaledb', 'init', '001_seed.sql'),
    )
  }
}

async function seedAnalytics() {
  if (shouldSeed('datapadplusplus-clickhouse', 'analytics')) {
    seedSqlWithStdin(
      'datapadplusplus-clickhouse',
      'clickhouse-client',
      ['--user', 'datapadplusplus', '--password', 'datapadplusplus', '--multiquery'],
      join(root, 'clickhouse', 'init', '001_seed.sql'),
    )
  }

  if (shouldSeed('datapadplusplus-influxdb', 'analytics')) {
    await httpRequest({ port: 8087, path: '/query?q=CREATE+DATABASE+metrics' })
    for (const query of [
      'INSERT order_latency,region=eu-west-1,account_id=1 value=18.4 1767225600000000000',
      'INSERT order_latency,region=eu-west-1,account_id=1 value=21.0 1767225660000000000',
      'INSERT order_latency,region=us-east-1,account_id=2 value=32.7 1767225720000000000',
    ]) {
      await httpRequest({
        port: 8087,
        path: `/query?db=metrics&q=${encodeURIComponent(query)}`,
      })
    }
  }
}

async function seedSearch() {
  for (const [container, port] of [
    ['datapadplusplus-opensearch', 9201],
    ['datapadplusplus-elasticsearch', 9202],
  ]) {
    if (!shouldSeed(container, 'search')) {
      continue
    }
    await httpRequest({
      method: 'PUT',
      port,
      path: '/orders',
      body: {
        mappings: {
          properties: {
            order_id: { type: 'keyword' },
            status: { type: 'keyword' },
            total_amount: { type: 'double' },
            updated_at: { type: 'date' },
          },
        },
      },
    }).catch(() => undefined)
    await httpRequest({
      method: 'POST',
      port,
      path: '/orders/_doc/101?refresh=true',
      body: {
        order_id: '101',
        account: { id: '1', name: 'Northwind' },
        status: 'processing',
        total_amount: 128.4,
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
  }
}

async function seedGraph() {
  if (shouldSeed('datapadplusplus-neo4j', 'graph')) {
    await httpRequest({
      method: 'POST',
      port: 7475,
      path: '/db/neo4j/tx/commit',
      headers: {
        authorization: `Basic ${Buffer.from('neo4j:datapadplusplus').toString('base64')}`,
      },
      body: {
        statements: [
          {
            statement:
              "MERGE (a:Account {id:'1', name:'Northwind'}) MERGE (o:Order {id:'101', status:'processing'}) MERGE (a)-[:PLACED]->(o) RETURN a, o",
          },
        ],
      },
    })
  }

  if (shouldSeed('datapadplusplus-arangodb', 'graph')) {
    const auth = { authorization: `Basic ${Buffer.from('root:datapadplusplus').toString('base64')}` }
    await httpRequest({ method: 'POST', port: 8529, path: '/_api/database', headers: auth, body: { name: 'datapadplusplus' } }).catch(() => undefined)
    await httpRequest({ method: 'POST', port: 8529, path: '/_db/datapadplusplus/_api/collection', headers: auth, body: { name: 'accounts' } }).catch(() => undefined)
    await httpRequest({ method: 'POST', port: 8529, path: '/_db/datapadplusplus/_api/collection', headers: auth, body: { name: 'orders' } }).catch(() => undefined)
    await httpRequest({
      method: 'POST',
      port: 8529,
      path: '/_db/datapadplusplus/_api/cursor',
      headers: auth,
      body: {
        query:
          "UPSERT { _key: '1' } INSERT { _key: '1', name: 'Northwind', status: 'active' } UPDATE { status: 'active' } IN accounts",
      },
    })
  }
}

async function seedWideColumn() {
  if (shouldSeed('datapadplusplus-cassandra', 'widecolumn')) {
    docker(['exec', 'datapadplusplus-cassandra', 'cqlsh', '-f', '/work/001_seed.cql'])
  }
}

async function seedOracle() {
  if (shouldSeed('datapadplusplus-oracle', 'oracle')) {
    docker([
      'exec',
      'datapadplusplus-oracle',
      'bash',
      '-lc',
      "sqlplus -s datapadplusplus/datapadplusplus@//localhost:1521/FREEPDB1 @/container-entrypoint-initdb.d/001_seed.sql",
    ])
  }
}

async function seedCloudContract() {
  if (!shouldSeed('datapadplusplus-dynamodb', 'cloud-contract')) {
    return
  }

  const endpoint = 'http://127.0.0.1:8001'
  const commonHeaders = {
    'x-amz-target': 'DynamoDB_20120810.CreateTable',
    'content-type': 'application/x-amz-json-1.0',
  }
  await httpRequest({
    method: 'POST',
    port: 8001,
    path: '/',
    headers: commonHeaders,
    body: {
      TableName: 'orders',
      AttributeDefinitions: [{ AttributeName: 'order_id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'order_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    },
  }).catch(() => undefined)
  await globalThis.fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-amz-target': 'DynamoDB_20120810.PutItem',
      'content-type': 'application/x-amz-json-1.0',
    },
    body: JSON.stringify({
      TableName: 'orders',
      Item: {
        order_id: { S: '101' },
        status: { S: 'processing' },
        total_amount: { N: '128.40' },
      },
    }),
  })
}

await seedCore()
await seedCache()
await seedSqlPlus()
await seedAnalytics()
await seedSearch()
await seedGraph()
await seedWideColumn()
await seedOracle()
await seedCloudContract()
