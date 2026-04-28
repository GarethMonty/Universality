const QUERY_TITLE_SUFFIXES = [
  'sql',
  'json',
  'text',
  'mongodb',
  'cql',
  'cypher',
  'flux',
  'redis',
  'aql',
  'gremlin',
  'sparql',
  'promql',
  'influxql',
  'opentsdb',
  'query-dsl',
  'esql',
  'google-sql',
  'snowflake-sql',
  'clickhouse-sql',
]

const QUERY_TITLE_SUFFIX_PATTERN = new RegExp(
  `(?:\\.(${QUERY_TITLE_SUFFIXES.join('|')}))$`,
  'i',
)

export function normalizeTabDisplayTitle(title: string) {
  return title.replace(QUERY_TITLE_SUFFIX_PATTERN, '')
}

export function colorWithAlpha(color: string, alpha: number) {
  const hex = color.trim()

  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return 'rgba(55, 148, 255, 0.14)'
  }

  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
