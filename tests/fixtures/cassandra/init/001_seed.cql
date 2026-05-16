create keyspace if not exists datapadplusplus
with replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

use datapadplusplus;

create table if not exists accounts_by_id (
  account_id int primary key,
  name text,
  status text,
  tier text,
  updated_at timestamp
);

create table if not exists products_by_sku (
  sku text primary key,
  name text,
  category text,
  inventory_available int,
  price decimal,
  updated_at timestamp
);

create table if not exists orders_by_account (
  account_id int,
  order_id int,
  status text,
  total_amount decimal,
  updated_at timestamp,
  primary key ((account_id), order_id)
);

create index if not exists orders_by_account_status_idx on orders_by_account (status);

insert into accounts_by_id (account_id, name, status, tier, updated_at)
values (1, 'Northwind', 'active', 'enterprise', toTimestamp(now()));

insert into accounts_by_id (account_id, name, status, tier, updated_at)
values (2, 'Contoso', 'active', 'growth', toTimestamp(now()));

insert into accounts_by_id (account_id, name, status, tier, updated_at)
values (3, 'Fabrikam', 'paused', 'starter', toTimestamp(now()));

insert into products_by_sku (sku, name, category, inventory_available, price, updated_at)
values ('luna-lamp', 'Luna Lamp', 'lighting', 18, 49.99, toTimestamp(now()));

insert into products_by_sku (sku, name, category, inventory_available, price, updated_at)
values ('aurora-desk', 'Aurora Desk', 'furniture', 8, 349.00, toTimestamp(now()));

insert into products_by_sku (sku, name, category, inventory_available, price, updated_at)
values ('nova-chair', 'Nova Chair', 'furniture', 24, 129.50, toTimestamp(now()));

insert into orders_by_account (account_id, order_id, status, total_amount, updated_at)
values (1, 101, 'processing', 128.40, toTimestamp(now()));

insert into orders_by_account (account_id, order_id, status, total_amount, updated_at)
values (2, 102, 'fulfilled', 88.00, toTimestamp(now()));
