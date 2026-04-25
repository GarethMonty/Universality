create extension if not exists timescaledb;

create table if not exists order_metrics (
  time timestamptz not null,
  account_id integer not null,
  region text not null,
  orders integer not null,
  latency_ms double precision not null
);

select create_hypertable('order_metrics', 'time', if_not_exists => true);

create index if not exists order_metrics_region_time_idx on order_metrics (region, time desc);

delete from order_metrics where time >= '2026-01-01 00:00:00+00' and time < '2026-01-01 00:05:00+00';

insert into order_metrics (time, account_id, region, orders, latency_ms)
values
  ('2026-01-01 00:00:00+00', 1, 'eu-west-1', 12, 18.4),
  ('2026-01-01 00:01:00+00', 1, 'eu-west-1', 18, 21.0),
  ('2026-01-01 00:02:00+00', 2, 'us-east-1', 9, 32.7);

create or replace view order_metrics_recent as
select region, sum(orders) as orders, avg(latency_ms) as avg_latency_ms
from order_metrics
group by region;
