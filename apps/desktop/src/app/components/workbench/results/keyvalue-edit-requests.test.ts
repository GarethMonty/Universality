import type { ConnectionProfile } from '@datapadplusplus/shared-types'
import { describe, expect, it } from 'vitest'
import {
  buildKeyValueEditRequest,
  keyValueCanEdit,
  parseKeyValueInput,
} from './keyvalue-edit-requests'

const connection: ConnectionProfile = {
  id: 'conn-redis',
  name: 'Redis',
  engine: 'redis',
  family: 'keyvalue',
  host: '127.0.0.1',
  port: 6379,
  database: '0',
  environmentIds: ['env-dev'],
  tags: [],
  favorite: false,
  readOnly: false,
  icon: 'redis',
  auth: {
    secretRef: {
      id: 'secret-redis',
      provider: 'manual',
      service: 'DataPad++',
      account: 'conn-redis',
      label: 'Redis credential',
    },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const editContext = {
  connectionId: 'conn-redis',
  environmentId: 'env-dev',
  queryText: 'GET session:1',
}

describe('keyvalue edit requests', () => {
  it('builds concrete Redis value edits', () => {
    expect(
      buildKeyValueEditRequest({
        connection,
        editContext,
        editKind: 'set-key-value',
        key: 'session:1',
        value: { state: 'paused' },
      }),
    ).toEqual({
      connectionId: 'conn-redis',
      environmentId: 'env-dev',
      editKind: 'set-key-value',
      confirmationText: undefined,
      target: {
        objectKind: 'key',
        path: [],
        key: 'session:1',
      },
      changes: [
        {
          value: { state: 'paused' },
          valueType: 'object',
        },
      ],
    })
  })

  it('requires confirmation for key deletion', () => {
    expect(
      buildKeyValueEditRequest({
        connection,
        editContext,
        editKind: 'delete-key',
        key: 'session:1',
      }),
    ).toMatchObject({
      editKind: 'delete-key',
      confirmationText: 'CONFIRM REDIS DELETE-KEY',
      changes: [],
    })
  })

  it('blocks read-only and non-keyvalue connections from key edits', () => {
    expect(keyValueCanEdit({ ...connection, readOnly: true }, editContext)).toBe(false)
    expect(
      buildKeyValueEditRequest({
        connection: { ...connection, readOnly: true },
        editContext,
        editKind: 'set-ttl',
        key: 'session:1',
        value: 60,
      }),
    ).toBeUndefined()
  })

  it('parses JSON-like input and preserves plain strings', () => {
    expect(parseKeyValueInput('{"state":"active"}')).toEqual({ state: 'active' })
    expect(parseKeyValueInput('42')).toBe(42)
    expect(parseKeyValueInput('plain text')).toBe('plain text')
  })
})
