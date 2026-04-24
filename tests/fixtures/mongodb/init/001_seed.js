db = db.getSiblingDB('catalog');

db.createUser({
  user: 'universality',
  pwd: 'universality',
  roles: [{ role: 'readWrite', db: 'catalog' }],
});

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
