import { spawnSync } from 'node:child_process'

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

function runDockerCompose(args) {
  const result = spawnSync('docker', ['compose', '-f', 'tests/fixtures/docker-compose.yml', ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

const [command, profile] = process.argv.slice(2)

switch (command) {
  case 'up':
    runDockerCompose(['up', '-d', '--wait'])
    break
  case 'up-profile':
    if (!profile) {
      throw new Error(`Usage: npm run fixtures:up:profile -- <${profiles.join('|')}>`)
    }
    if (!profiles.includes(profile)) {
      throw new Error(`Unknown fixture profile "${profile}". Valid profiles: ${profiles.join(', ')}`)
    }
    runDockerCompose(['--profile', profile, 'up', '-d', '--wait'])
    break
  case 'up-all':
    runDockerCompose([
      ...profiles.flatMap((item) => ['--profile', item]),
      'up',
      '-d',
      '--wait',
    ])
    break
  default:
    throw new Error('Usage: node tests/fixtures/compose.mjs <up|up-profile|up-all> [profile]')
}
