import type { ExecutionResultEnvelope, ResultPayload } from '@universality/shared-types'

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function exportPayload(payload: ResultPayload, result?: ExecutionResultEnvelope) {
  const serialized = payloadToText(payload)
  const { extension, mimeType } = exportDetailsForPayload(payload)
  const filename = sanitizeFilename(
    `${result?.engine ?? 'universality'}-${payload.renderer}-${result?.executedAt ?? 'result'}.${extension}`,
  )
  const blob = new Blob([serialized], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function payloadToText(payload: ResultPayload) {
  if (payload.renderer === 'table') {
    return tableToCsv(payload.columns, payload.rows)
  }

  if (payload.renderer === 'raw') {
    return payload.text
  }

  if (payload.renderer === 'document') {
    return JSON.stringify(payload.documents, null, 2)
  }

  if (payload.renderer === 'json') {
    return JSON.stringify(payload.value, null, 2)
  }

  if (payload.renderer === 'keyvalue') {
    return JSON.stringify(
      {
        entries: payload.entries,
        ttl: payload.ttl,
        memoryUsage: payload.memoryUsage,
      },
      null,
      2,
    )
  }

  if (payload.renderer === 'schema') {
    return JSON.stringify(payload.items, null, 2)
  }

  return JSON.stringify(payload, null, 2)
}

function tableToCsv(columns: string[], rows: string[][]) {
  return [columns, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(','))
    .join('\n')
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function exportDetailsForPayload(payload: ResultPayload) {
  if (payload.renderer === 'table') {
    return { extension: 'csv', mimeType: 'text/csv;charset=utf-8' }
  }

  if (payload.renderer === 'raw') {
    return { extension: 'txt', mimeType: 'text/plain;charset=utf-8' }
  }

  return { extension: 'json', mimeType: 'application/json;charset=utf-8' }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-')
}
