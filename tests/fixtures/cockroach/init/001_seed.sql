create database if not exists datapadplusplus;

use datapadplusplus;

create table if not exists accounts (
  id int primary key,
  name string not null,
  status string not null,
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  transaction_id int primary key,
  account_id int not null,
  amount decimal not null,
  status string not null,
  updated_at timestamptz not null default now(),
  index transactions_account_status_idx (account_id, status)
);

create table if not exists products (
  sku string primary key,
  name string not null,
  category string not null,
  inventory_available int not null,
  price decimal not null,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  order_id int primary key,
  account_id int not null,
  status string not null,
  total_amount decimal not null,
  updated_at timestamptz not null default now(),
  index orders_account_status_idx (account_id, status)
);

upsert into accounts (id, name, status, updated_at)
values
  (1, 'Northwind', 'active', now()),
  (2, 'Contoso', 'active', now()),
  (3, 'Fabrikam', 'paused', now());

upsert into transactions (transaction_id, account_id, amount, status, updated_at)
values
  (9001, 1, 128.40, 'posted', now()),
  (9002, 2, 88.00, 'posted', now()),
  (9003, 1, 42.50, 'pending', now());

upsert into products (sku, name, category, inventory_available, price, updated_at)
values
  ('luna-lamp', 'Luna Lamp', 'lighting', 18, 49.99, now()),
  ('aurora-desk', 'Aurora Desk', 'furniture', 8, 349.00, now()),
  ('nova-chair', 'Nova Chair', 'furniture', 24, 129.50, now());

upsert into orders (order_id, account_id, status, total_amount, updated_at)
values
  (101, 1, 'processing', 128.40, now()),
  (102, 2, 'fulfilled', 88.00, now()),
  (103, 1, 'on-hold', 42.50, now());
