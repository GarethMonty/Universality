import { describe, expect, it } from 'vitest'
import { buildMongoFindQueryText, createDefaultMongoFindBuilderState } from './mongo-find'

describe('Mongo query builder', () => {
  it('generates basic collection find JSON', () => {
    const query = JSON.parse(buildMongoFindQueryText(createDefaultMongoFindBuilderState('products')))

    expect(query).toEqual({
      collection: 'products',
      filter: {},
      limit: 20,
    })
  })

  it('generates filter operators with typed values', () => {
    const query = JSON.parse(
      buildMongoFindQueryText({
        kind: 'mongo-find',
        collection: 'products',
        filters: [
          {
            id: 'filter-sku',
            field: 'sku',
            operator: 'eq',
            value: 'SKU-001',
            valueType: 'string',
          },
          {
            id: 'filter-price',
            field: 'price',
            operator: 'gte',
            value: '10.5',
            valueType: 'number',
          },
          {
            id: 'filter-active',
            field: 'active',
            operator: 'exists',
            value: 'true',
            valueType: 'boolean',
          },
          {
            id: 'filter-tags',
            field: 'tags',
            operator: 'in',
            value: 'featured, clearance',
            valueType: 'string',
          },
        ],
        projectionMode: 'all',
        projectionFields: [],
        sort: [],
      }),
    )

    expect(query.filter).toEqual({
      sku: 'SKU-001',
      price: { $gte: 10.5 },
      active: { $exists: true },
      tags: { $in: ['featured', 'clearance'] },
    })
  })

  it('generates projection, sort, skip, and limit', () => {
    const query = JSON.parse(
      buildMongoFindQueryText({
        kind: 'mongo-find',
        collection: 'orders',
        filters: [],
        projectionMode: 'include',
        projectionFields: [
          { id: 'field-total', field: 'total' },
          { id: 'field-created', field: 'createdAt' },
        ],
        sort: [{ id: 'sort-created', field: 'createdAt', direction: 'desc' }],
        skip: 20,
        limit: 10,
      }),
    )

    expect(query).toEqual({
      collection: 'orders',
      filter: {},
      projection: {
        total: 1,
        createdAt: 1,
      },
      sort: {
        createdAt: -1,
      },
      skip: 20,
      limit: 10,
    })
  })

  it('keeps JSON values intact when requested', () => {
    const query = JSON.parse(
      buildMongoFindQueryText({
        kind: 'mongo-find',
        collection: 'events',
        filters: [
          {
            id: 'filter-meta',
            field: 'metadata',
            operator: 'eq',
            value: '{"source":"fixture"}',
            valueType: 'json',
          },
        ],
        projectionMode: 'exclude',
        projectionFields: [{ id: 'field-secret', field: 'secret' }],
        sort: [],
      }),
    )

    expect(query.filter.metadata).toEqual({ source: 'fixture' })
    expect(query.projection).toEqual({ secret: 0 })
  })

  it('supports OR filter groups and disabled filters', () => {
    const query = JSON.parse(
      buildMongoFindQueryText({
        kind: 'mongo-find',
        collection: 'orders',
        filterGroups: [{ id: 'group-status', label: 'Status', logic: 'or' }],
        filters: [
          {
            id: 'filter-open',
            enabled: true,
            field: 'status',
            groupId: 'group-status',
            operator: 'eq',
            value: 'open',
            valueType: 'string',
          },
          {
            id: 'filter-paused',
            enabled: true,
            field: 'status',
            groupId: 'group-status',
            operator: 'eq',
            value: 'paused',
            valueType: 'string',
          },
          {
            id: 'filter-archived',
            enabled: false,
            field: 'status',
            groupId: 'group-status',
            operator: 'eq',
            value: 'archived',
            valueType: 'string',
          },
        ],
        projectionMode: 'all',
        projectionFields: [],
        sort: [],
      }),
    )

    expect(query.filter).toEqual({
      $or: [{ status: 'open' }, { status: 'paused' }],
    })
  })

  it('combines separate filter groups with AND', () => {
    const query = JSON.parse(
      buildMongoFindQueryText({
        kind: 'mongo-find',
        collection: 'orders',
        filterGroups: [
          { id: 'group-status', label: 'Status', logic: 'or' },
          { id: 'group-total', label: 'Total', logic: 'and' },
        ],
        filters: [
          {
            id: 'filter-open',
            field: 'status',
            groupId: 'group-status',
            operator: 'eq',
            value: 'open',
            valueType: 'string',
          },
          {
            id: 'filter-paused',
            field: 'status',
            groupId: 'group-status',
            operator: 'eq',
            value: 'paused',
            valueType: 'string',
          },
          {
            id: 'filter-total',
            field: 'total',
            groupId: 'group-total',
            operator: 'gte',
            value: '100',
            valueType: 'number',
          },
        ],
        projectionMode: 'all',
        projectionFields: [],
        sort: [],
      }),
    )

    expect(query.filter).toEqual({
      $and: [
        { $or: [{ status: 'open' }, { status: 'paused' }] },
        { total: { $gte: 100 } },
      ],
    })
  })
})
