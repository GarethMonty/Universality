create database if not exists analytics;

create table if not exists analytics.events (
  event_date Date,
  event_time DateTime,
  account_id UInt32,
  event_type String,
  latency_ms Float64
) engine = MergeTree
order by (event_date, account_id, event_type);

truncate table analytics.events;

insert into analytics.events
values
  ('2026-01-01', '2026-01-01 00:00:00', 1, 'order.created', 18.4),
  ('2026-01-01', '2026-01-01 00:01:00', 1, 'order.paid', 21.0),
  ('2026-01-01', '2026-01-01 00:02:00', 2, 'order.created', 32.7);
