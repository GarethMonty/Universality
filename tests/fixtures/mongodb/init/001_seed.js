db = db.getSiblingDB('catalog');

if (!db.getUser('datapadplusplus')) {
  db.createUser({
    user: 'datapadplusplus',
    pwd: 'datapadplusplus',
    roles: [{ role: 'readWrite', db: 'catalog' }],
  });
}

db.products.updateOne(
  { sku: 'luna-lamp' },
  {
    $set: {
      sku: 'luna-lamp',
      channels: ['web', 'store'],
      inventory: { reserved: 4, available: 18 },
      updatedAt: new Date(),
    },
  },
  { upsert: true },
);

db.products.updateOne(
  { sku: 'aurora-desk' },
  {
    $set: {
      sku: 'aurora-desk',
      channels: ['web'],
      inventory: { reserved: 1, available: 8 },
      updatedAt: new Date(),
    },
  },
  { upsert: true },
);

db.products.createIndex({ sku: 1 }, { unique: true });

const perfTargetCount = 100000;
const perfCollection = db.perfDocuments;
const existingPerfCount = perfCollection.estimatedDocumentCount();

if (existingPerfCount < perfTargetCount) {
  perfCollection.deleteMany({});

  const regions = ['eu-west-1', 'us-east-1', 'ap-southeast-1', 'af-south-1', 'local'];
  const events = ['order.created', 'order.updated', 'inventory.adjusted', 'session.heartbeat'];
  const batch = [];

  for (let id = 1; id <= perfTargetCount; id += 1) {
    batch.push({
      _id: id,
      accountId: (id % 250) + 1,
      region: regions[id % regions.length],
      eventName: events[id % events.length],
      amount: Number(((id % 10000) / 3 + 10).toFixed(2)),
      createdAt: new Date(Date.now() - (id % 43200) * 1000),
      tags: [`sku-${String(id % 1000).padStart(4, '0')}`, id % 2 === 0 ? 'even' : 'odd'],
      payload: {
        sequence: id,
        shard: id % 32,
        synthetic: true,
      },
    });

    if (batch.length >= 1000) {
      perfCollection.insertMany(batch, { ordered: false });
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    perfCollection.insertMany(batch, { ordered: false });
  }
}

perfCollection.createIndex({ accountId: 1, createdAt: -1 });
perfCollection.createIndex({ region: 1 });
perfCollection.createIndex({ eventName: 1 });
