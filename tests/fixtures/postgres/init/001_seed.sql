create schema if not exists observability;

create table if not exists observability.table_health (
  table_name text primary key,
  rows_estimate bigint not null,
  last_vacuum timestamptz not null
);

insert into observability.table_health (table_name, rows_estimate, last_vacuum)
values
  ('accounts', 128804, now()),
  ('transactions', 9843212, now()),
  ('alerts', 440, now())
on conflict (table_name) do update
set
  rows_estimate = excluded.rows_estimate,
  last_vacuum = excluded.last_vacuum;
