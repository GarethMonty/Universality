import http from 'node:http'

function json(res, value, status = 200) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function collect(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function bigQueryHandler(req, res) {
  if (req.url === '/health') return json(res, { ok: true, service: 'bigquery' })
  if (req.url.includes('/datasets') && req.method === 'GET') {
    return json(res, {
      datasets: [{ datasetReference: { datasetId: 'analytics' } }],
    })
  }
  if (req.url.includes('/tables') && req.method === 'GET') {
    return json(res, {
      tables: [{ tableReference: { tableId: 'orders' } }],
    })
  }
  return json(res, {
    jobComplete: true,
    totalBytesProcessed: '0',
    schema: { fields: [{ name: 'status', type: 'STRING' }] },
    rows: [{ f: [{ v: 'cloud-contract-ok' }] }],
  })
}

async function snowflakeHandler(req, res) {
  if (req.url === '/health') return json(res, { ok: true, service: 'snowflake' })
  await collect(req)
  return json(res, {
    code: '090001',
    message: 'success',
    statementHandle: 'fixture-statement',
    resultSetMetaData: { rowType: [{ name: 'STATUS', type: 'text' }] },
    data: [['cloud-contract-ok']],
    stats: { bytesScanned: 0, partitionsScanned: 0 },
  })
}

async function cosmosHandler(req, res) {
  if (req.url === '/health') return json(res, { ok: true, service: 'cosmosdb' })
  if (req.url.endsWith('/dbs')) {
    return json(res, { Databases: [{ id: 'datapadplusplus' }] })
  }
  if (req.url.includes('/colls') && !req.url.includes('/docs')) {
    return json(res, { DocumentCollections: [{ id: 'orders' }] })
  }
  await collect(req)
  return json(res, {
    Documents: [{ id: 'order-101', status: 'cloud-contract-ok', total: 128.4 }],
  })
}

async function neptuneHandler(req, res) {
  if (req.url === '/health') return json(res, { ok: true, service: 'neptune' })
  if (req.url === '/status') {
    return json(res, { status: 'healthy', role: 'writer' })
  }
  await collect(req)
  return json(res, {
    result: { data: [{ id: 'account-1', label: 'Account' }] },
    results: { bindings: [{ node: { type: 'literal', value: 'cloud-contract-ok' } }] },
  })
}

const handlers = new Map([
  [19050, bigQueryHandler],
  [19060, snowflakeHandler],
  [19070, cosmosHandler],
  [19080, neptuneHandler],
])

for (const [port, handler] of handlers) {
  http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      json(res, { error: String(error?.message ?? error) }, 500)
    })
  }).listen(port, '0.0.0.0', () => {
    console.log(`DataPad++ cloud-contract fixture listening on ${port}`)
  })
}
