import type {
  QueryBuilderState,
  RedisKeyBrowserState,
  RedisKeyTypeFilter,
} from '@datapadplusplus/shared-types'

export const REDIS_KEY_TYPE_FILTERS: Array<{
  value: RedisKeyTypeFilter
  label: string
}> = [
  { value: 'all', label: 'All Key Types' },
  { value: 'string', label: 'Strings' },
  { value: 'hash', label: 'Hashes' },
  { value: 'list', label: 'Lists' },
  { value: 'set', label: 'Sets' },
  { value: 'zset', label: 'Sorted Sets' },
  { value: 'stream', label: 'Streams' },
  { value: 'json', label: 'JSON' },
  { value: 'timeseries', label: 'TimeSeries' },
  { value: 'bloom', label: 'Bloom' },
  { value: 'cuckoo', label: 'Cuckoo' },
  { value: 'cms', label: 'Count-Min' },
  { value: 'topk', label: 'TopK' },
  { value: 'tdigest', label: 't-digest' },
  { value: 'vectorset', label: 'Vector Sets' },
]

export function createDefaultRedisKeyBrowserState(
  pattern = '*',
  pageSize = 100,
): RedisKeyBrowserState {
  const state: RedisKeyBrowserState = {
    kind: 'redis-key-browser',
    pattern,
    typeFilter: 'all',
    cursor: '0',
    scanCount: pageSize,
    pageSize,
    scannedCount: 0,
    expandedPrefixes: [],
    visibleColumns: ['ttl', 'memory', 'length'],
    viewMode: 'tree',
  }

  return {
    ...state,
    lastAppliedQueryText: buildRedisKeyBrowserQueryText(state),
  }
}

export function isRedisKeyBrowserState(
  state: QueryBuilderState | undefined,
): state is RedisKeyBrowserState {
  return state?.kind === 'redis-key-browser'
}

export function buildRedisKeyBrowserQueryText(state: RedisKeyBrowserState) {
  return JSON.stringify(
    {
      mode: 'redis-key-browser',
      pattern: state.pattern || '*',
      type: state.typeFilter || 'all',
      count: state.scanCount ?? state.pageSize ?? 100,
    },
    null,
    2,
  )
}

export function parseRedisKeyBrowserQueryText(
  queryText: string,
): RedisKeyBrowserState | undefined {
  try {
    const parsed = JSON.parse(queryText) as {
      mode?: unknown
      pattern?: unknown
      type?: unknown
      count?: unknown
    }

    if (parsed.mode !== 'redis-key-browser') {
      return undefined
    }

    const state = createDefaultRedisKeyBrowserState(
      typeof parsed.pattern === 'string' ? parsed.pattern : '*',
      typeof parsed.count === 'number' && Number.isFinite(parsed.count)
        ? Math.max(1, Math.floor(parsed.count))
        : 100,
    )

    return {
      ...state,
      typeFilter: isRedisKeyTypeFilter(parsed.type) ? parsed.type : 'all',
    }
  } catch {
    return undefined
  }
}

export function redisKeyTypeLabel(type: string | undefined) {
  const normalized = (type ?? 'unknown').toLowerCase()
  return REDIS_KEY_TYPE_FILTERS.find((item) => item.value === normalized)?.label ?? normalized
}

function isRedisKeyTypeFilter(value: unknown): value is RedisKeyTypeFilter {
  return (
    typeof value === 'string' &&
    REDIS_KEY_TYPE_FILTERS.some((item) => item.value === value)
  )
}
