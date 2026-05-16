create schema if not exists observability;

create table if not exists public.accounts (
  id integer primary key,
  name text not null,
  status text not null,
  tier text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  sku text primary key,
  name text not null,
  category text not null,
  inventory_available integer not null,
  price numeric(12, 2) not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  order_id integer primary key,
  account_id integer not null references public.accounts(id),
  status text not null,
  total_amount numeric(12, 2) not null,
  updated_at timestamptz not null default now()
);

create index if not exists orders_account_status_idx on public.orders (account_id, status);

create table if not exists observability.table_health (
  table_name text primary key,
  rows_estimate bigint not null,
  last_vacuum timestamptz not null
);

create table if not exists observability.perf_events (
  id bigint primary key,
  account_id integer not null,
  region text not null,
  event_name text not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null
);

insert into public.accounts (id, name, status, tier, updated_at)
values
  (1, 'Northwind', 'active', 'enterprise', now()),
  (2, 'Contoso', 'active', 'growth', now()),
  (3, 'Fabrikam', 'paused', 'starter', now())
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  tier = excluded.tier,
  updated_at = excluded.updated_at;

insert into public.products (sku, name, category, inventory_available, price, updated_at)
values
  ('luna-lamp', 'Luna Lamp', 'lighting', 18, 49.99, now()),
  ('aurora-desk', 'Aurora Desk', 'furniture', 8, 349.00, now()),
  ('nova-chair', 'Nova Chair', 'furniture', 24, 129.50, now())
on conflict (sku) do update
set
  name = excluded.name,
  category = excluded.category,
  inventory_available = excluded.inventory_available,
  price = excluded.price,
  updated_at = excluded.updated_at;

insert into public.orders (order_id, account_id, status, total_amount, updated_at)
values
  (101, 1, 'processing', 128.40, now()),
  (102, 2, 'fulfilled', 88.00, now()),
  (103, 1, 'on-hold', 42.50, now())
on conflict (order_id) do update
set
  account_id = excluded.account_id,
  status = excluded.status,
  total_amount = excluded.total_amount,
  updated_at = excluded.updated_at;

create or replace view public.active_accounts as
select id, name, status, tier, updated_at
from public.accounts
where status = 'active';

insert into observability.table_health (table_name, rows_estimate, last_vacuum)
values
  ('accounts', 128804, now()),
  ('transactions', 9843212, now()),
  ('alerts', 440, now()),
  ('observability.perf_events', 100000, now())
on conflict (table_name) do update
set
  rows_estimate = excluded.rows_estimate,
  last_vacuum = excluded.last_vacuum;

insert into observability.perf_events (
  id,
  account_id,
  region,
  event_name,
  amount,
  created_at
)
select
  generated.id,
  (generated.id % 250) + 1,
  case generated.id % 5
    when 0 then 'eu-west-1'
    when 1 then 'us-east-1'
    when 2 then 'ap-southeast-1'
    when 3 then 'af-south-1'
    else 'local'
  end,
  case generated.id % 4
    when 0 then 'order.created'
    when 1 then 'order.updated'
    when 2 then 'inventory.adjusted'
    else 'session.heartbeat'
  end,
  round(((generated.id % 10000)::numeric / 3.0) + 10, 2),
  now() - ((generated.id % 43200) * interval '1 second')
from generate_series(1, 100000) as generated(id)
on conflict (id) do update
set
  account_id = excluded.account_id,
  region = excluded.region,
  event_name = excluded.event_name,
  amount = excluded.amount,
  created_at = excluded.created_at;
