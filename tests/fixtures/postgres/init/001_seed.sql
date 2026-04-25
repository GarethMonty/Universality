create schema if not exists observability;

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
