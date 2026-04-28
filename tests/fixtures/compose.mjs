import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import net from 'node:net'

const composeFile = 'tests/fixtures/docker-compose.yml'
const generatedEnvFile = 'tests/fixtures/.generated.env'

const profiles = [
  'cache',
  'sqlplus',
  'analytics',
  'search',
  'graph',
  'widecolumn',
  'oracle',
  'cloud-contract',
]

const fixturePorts = [
  { env: 'UNIVERSALITY_POSTGRES_PORT', container: 'universality-postgres', containerPort: 5432, defaultPort: 54329, fallbackStart: 55432, profiles: ['core'] },
  { env: 'UNIVERSALITY_MYSQL_PORT', container: 'universality-mysql', containerPort: 3306, defaultPort: 33060, fallbackStart: 33360, profiles: ['core'] },
  { env: 'UNIVERSALITY_SQLSERVER_PORT', container: 'universality-sqlserver', containerPort: 1433, defaultPort: 14333, fallbackStart: 15333, profiles: ['core'] },
  { env: 'UNIVERSALITY_MONGODB_PORT', container: 'universality-mongodb', containerPort: 27017, defaultPort: 27018, fallbackStart: 27118, profiles: ['core'] },
  { env: 'UNIVERSALITY_REDIS_PORT', container: 'universality-redis', containerPort: 6379, defaultPort: 6380, fallbackStart: 6480, profiles: ['core'] },
  { env: 'UNIVERSALITY_VALKEY_PORT', container: 'universality-valkey', containerPort: 6379, defaultPort: 6381, fallbackStart: 6481, profiles: ['cache'] },
  { env: 'UNIVERSALITY_MEMCACHED_PORT', container: 'universality-memcached', containerPort: 11211, defaultPort: 11212, fallbackStart: 11312, profiles: ['cache'] },
  { env: 'UNIVERSALITY_MARIADB_PORT', container: 'universality-mariadb', containerPort: 3306, defaultPort: 33061, fallbackStart: 33361, profiles: ['sqlplus'] },
  { env: 'UNIVERSALITY_COCKROACH_PORT', container: 'universality-cockroachdb', containerPort: 26257, defaultPort: 26257, fallbackStart: 26357, profiles: ['sqlplus'] },
  { env: 'UNIVERSALITY_COCKROACH_HTTP_PORT', container: 'universality-cockroachdb', containerPort: 8080, defaultPort: 8080, fallbackStart: 18080, profiles: ['sqlplus'] },
  { env: 'UNIVERSALITY_TIMESCALE_PORT', container: 'universality-timescaledb', containerPort: 5432, defaultPort: 54330, fallbackStart: 55433, profiles: ['sqlplus'] },
  { env: 'UNIVERSALITY_CLICKHOUSE_HTTP_PORT', container: 'universality-clickhouse', containerPort: 8123, defaultPort: 8124, fallbackStart: 18124, profiles: ['analytics'] },
  { env: 'UNIVERSALITY_CLICKHOUSE_NATIVE_PORT', container: 'universality-clickhouse', containerPort: 9000, defaultPort: 9001, fallbackStart: 19001, profiles: ['analytics'] },
  { env: 'UNIVERSALITY_INFLUXDB_PORT', container: 'universality-influxdb', containerPort: 8086, defaultPort: 8087, fallbackStart: 18087, profiles: ['analytics'] },
  { env: 'UNIVERSALITY_PROMETHEUS_PORT', container: 'universality-prometheus', containerPort: 9090, defaultPort: 9091, fallbackStart: 19091, profiles: ['analytics'] },
  { env: 'UNIVERSALITY_OPENSEARCH_PORT', container: 'universality-opensearch', containerPort: 9200, defaultPort: 9201, fallbackStart: 19201, profiles: ['search'] },
  { env: 'UNIVERSALITY_ELASTICSEARCH_PORT', container: 'universality-elasticsearch', containerPort: 9200, defaultPort: 9202, fallbackStart: 19202, profiles: ['search'] },
  { env: 'UNIVERSALITY_NEO4J_HTTP_PORT', container: 'universality-neo4j', containerPort: 7474, defaultPort: 7475, fallbackStart: 17475, profiles: ['graph'] },
  { env: 'UNIVERSALITY_NEO4J_BOLT_PORT', container: 'universality-neo4j', containerPort: 7687, defaultPort: 7688, fallbackStart: 17688, profiles: ['graph'] },
  { env: 'UNIVERSALITY_ARANGODB_PORT', container: 'universality-arangodb', containerPort: 8529, defaultPort: 8529, fallbackStart: 18529, profiles: ['graph'] },
  { env: 'UNIVERSALITY_JANUSGRAPH_PORT', container: 'universality-janusgraph', containerPort: 8182, defaultPort: 8183, fallbackStart: 18183, profiles: ['graph'] },
  { env: 'UNIVERSALITY_CASSANDRA_PORT', container: 'universality-cassandra', containerPort: 9042, defaultPort: 9043, fallbackStart: 19043, profiles: ['widecolumn'] },
  { env: 'UNIVERSALITY_ORACLE_PORT', container: 'universality-oracle', containerPort: 1521, defaultPort: 1522, fallbackStart: 11522, profiles: ['oracle'] },
  { env: 'UNIVERSALITY_DYNAMODB_PORT', container: 'universality-dynamodb', containerPort: 8000, defaultPort: 8001, fallbackStart: 18001, profiles: ['cloud-contract'] },
  { env: 'UNIVERSALITY_BIGQUERY_MOCK_PORT', container: 'universality-cloud-contract', containerPort: 19050, defaultPort: 19050, fallbackStart: 19150, profiles: ['cloud-contract'] },
  { env: 'UNIVERSALITY_SNOWFLAKE_MOCK_PORT', container: 'universality-cloud-contract', containerPort: 19060, defaultPort: 19060, fallbackStart: 19160, profiles: ['cloud-contract'] },
  { env: 'UNIVERSALITY_COSMOSDB_MOCK_PORT', container: 'universality-cloud-contract', containerPort: 19070, defaultPort: 19070, fallbackStart: 19170, profiles: ['cloud-contract'] },
  { env: 'UNIVERSALITY_NEPTUNE_MOCK_PORT', container: 'universality-cloud-contract', containerPort: 19080, defaultPort: 19080, fallbackStart: 19180, profiles: ['cloud-contract'] },
]

function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: options.encoding,
    stdio: options.stdio ?? 'inherit',
    shell: false,
  })
}

function runDockerCompose(args, env) {
  const result = runDocker(['compose', '--env-file', generatedEnvFile, '-f', composeFile, ...args], {
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function dockerOutput(args) {
  const result = runDocker(args, { encoding: 'utf8', stdio: 'pipe' })

  if (result.status !== 0) {
    return ''
  }

  return result.stdout.trim()
}

function mappedContainerPort(container, containerPort) {
  const output = dockerOutput(['port', container, `${containerPort}/tcp`])
  const match = output.match(/:(\d+)\s*$/m)

  return match ? Number(match[1]) : undefined
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '0.0.0.0')
  })
}

async function availablePort(defaultPort, fallbackStart) {
  if (await canBind(defaultPort)) {
    return defaultPort
  }

  for (let offset = 0; offset < 100; offset += 1) {
    const candidate = fallbackStart + offset

    if (await canBind(candidate)) {
      return candidate
    }
  }

  throw new Error(`Unable to find an available host port near ${fallbackStart}`)
}

async function buildComposeEnvironment(selectedProfiles) {
  const env = { ...process.env }
  const selected = new Set(['core', ...selectedProfiles])
  const lines = [
    '# Generated by tests/fixtures/compose.mjs.',
    '# Delete this file to force fresh fixture port detection.',
  ]

  for (const config of fixturePorts) {
    if (!config.profiles.some((profile) => selected.has(profile))) {
      continue
    }

    const explicit = process.env[config.env]
    const mapped = explicit ? undefined : mappedContainerPort(config.container, config.containerPort)
    const port = Number(explicit ?? mapped ?? (await availablePort(config.defaultPort, config.fallbackStart)))

    env[config.env] = String(port)
    lines.push(`${config.env}=${port}`)

    if (!explicit && !mapped && port !== config.defaultPort) {
      console.log(
        `Fixture port ${config.defaultPort} is unavailable; using ${config.env}=${port}.`,
      )
    }
  }

  writeFileSync(generatedEnvFile, `${lines.join('\n')}\n`)
  return env
}

const [command, profile] = process.argv.slice(2)

switch (command) {
  case 'up': {
    const env = await buildComposeEnvironment([])
    runDockerCompose(['up', '-d', '--wait'], env)
    break
  }
  case 'up-profile': {
    if (!profile) {
      throw new Error(`Usage: npm run fixtures:up:profile -- <${profiles.join('|')}>`)
    }
    if (!profiles.includes(profile)) {
      throw new Error(`Unknown fixture profile "${profile}". Valid profiles: ${profiles.join(', ')}`)
    }
    const env = await buildComposeEnvironment([profile])
    runDockerCompose(['--profile', profile, 'up', '-d', '--wait'], env)
    break
  }
  case 'up-all': {
    const env = await buildComposeEnvironment(profiles)
    runDockerCompose([
      ...profiles.flatMap((item) => ['--profile', item]),
      'up',
      '-d',
      '--wait',
    ], env)
    break
  }
  default:
    throw new Error('Usage: node tests/fixtures/compose.mjs <up|up-profile|up-all> [profile]')
}
