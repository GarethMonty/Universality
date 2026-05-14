import type {
  ConnectionProfile,
  DataEditExecutionRequest,
} from '@datapadplusplus/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import { buildCassandraRowCellEditRequest } from './cassandra-row-edit-requests'
import {
  buildDynamoDbItemCellEditRequest,
  buildDynamoDbItemDeleteRequest,
  buildDynamoDbItemPutRequest,
} from './dynamodb-item-edit-requests'
import {
  buildTableCellEditRequest,
  buildTableRowInsertRequest,
  buildTableRowDeleteRequest,
} from './table-edit-requests'

interface CellEditRequestInput {
  columnIndex: number
  columns: string[]
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  row: string[]
  value: string
}

interface RowDeleteRequestInput {
  columns: string[]
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  row: string[]
}

export function buildDataGridCellEditRequest(
  input: CellEditRequestInput,
): DataEditExecutionRequest | undefined {
  return (
    buildTableCellEditRequest(input) ??
    buildDynamoDbItemCellEditRequest(input) ??
    buildCassandraRowCellEditRequest(input)
  )
}

export function buildDataGridRowDeleteRequest(
  input: RowDeleteRequestInput,
): DataEditExecutionRequest | undefined {
  return (
    buildTableRowDeleteRequest(input) ??
    buildDynamoDbItemDeleteRequest(input)
  )
}

export function buildDataGridRowInsertRequest(
  input: RowDeleteRequestInput,
): DataEditExecutionRequest | undefined {
  return buildTableRowInsertRequest(input) ?? buildDynamoDbItemPutRequest(input)
}
