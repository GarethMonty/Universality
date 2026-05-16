create table if not exists accounts (
  id bigint primary key,
  name varchar(128) not null,
  status varchar(32) not null,
  updated_at timestamp not null default current_timestamp
);

create table if not exists orders (
  order_id bigint primary key,
  account_id bigint not null,
  status varchar(32) not null,
  total_amount decimal(12,2) not null,
  updated_at timestamp not null default current_timestamp,
  index orders_account_status_idx (account_id, status)
);

create table if not exists products (
  sku varchar(64) primary key,
  name varchar(128) not null,
  category varchar(64) not null,
  inventory_available int not null,
  price decimal(12,2) not null,
  updated_at timestamp not null default current_timestamp
);

create table if not exists perf_order_events (
  id bigint primary key,
  account_id bigint not null,
  region varchar(32) not null,
  event_name varchar(64) not null,
  total_amount decimal(12,2) not null,
  updated_at timestamp not null default current_timestamp,
  index perf_order_events_account_updated_idx (account_id, updated_at),
  index perf_order_events_region_idx (region)
);

set max_recursive_iterations = 100000;

insert into accounts (id, name, status, updated_at)
values
  (1, 'Northwind', 'active', now()),
  (2, 'Contoso', 'active', now()),
  (3, 'Fabrikam', 'paused', now())
on duplicate key update
  name = values(name),
  status = values(status),
  updated_at = values(updated_at);

insert into orders (order_id, account_id, status, total_amount, updated_at)
values
  (101, 1, 'processing', 128.40, now()),
  (102, 2, 'fulfilled', 88.00, now()),
  (103, 1, 'on-hold', 42.50, now())
on duplicate key update
  account_id = values(account_id),
  status = values(status),
  total_amount = values(total_amount),
  updated_at = values(updated_at);

insert into products (sku, name, category, inventory_available, price, updated_at)
values
  ('luna-lamp', 'Luna Lamp', 'lighting', 18, 49.99, now()),
  ('aurora-desk', 'Aurora Desk', 'furniture', 8, 349.00, now()),
  ('nova-chair', 'Nova Chair', 'furniture', 24, 129.50, now())
on duplicate key update
  name = values(name),
  category = values(category),
  inventory_available = values(inventory_available),
  price = values(price),
  updated_at = values(updated_at);

insert into perf_order_events (id, account_id, region, event_name, total_amount, updated_at)
with recursive sequence_numbers(id) as (
  select 1
  union all
  select id + 1 from sequence_numbers where id < 100000
)
select
  id,
  (id % 250) + 1,
  case id % 5
    when 0 then 'eu-west-1'
    when 1 then 'us-east-1'
    when 2 then 'ap-southeast-1'
    when 3 then 'af-south-1'
    else 'local'
  end,
  case id % 4
    when 0 then 'order.created'
    when 1 then 'order.updated'
    when 2 then 'inventory.adjusted'
    else 'session.heartbeat'
  end,
  ((id % 10000) / 3.0) + 10,
  timestampadd(second, -(id % 43200), now())
from sequence_numbers
on duplicate key update
  account_id = values(account_id),
  region = values(region),
  event_name = values(event_name),
  total_amount = values(total_amount),
  updated_at = values(updated_at);
