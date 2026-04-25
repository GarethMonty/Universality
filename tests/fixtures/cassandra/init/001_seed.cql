create keyspace if not exists universality
with replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

use universality;

create table if not exists orders_by_account (
  account_id int,
  order_id int,
  status text,
  total_amount decimal,
  updated_at timestamp,
  primary key ((account_id), order_id)
);

create index if not exists orders_by_account_status_idx on orders_by_account (status);

insert into orders_by_account (account_id, order_id, status, total_amount, updated_at)
values (1, 101, 'processing', 128.40, toTimestamp(now()));

insert into orders_by_account (account_id, order_id, status, total_amount, updated_at)
values (2, 102, 'fulfilled', 88.00, toTimestamp(now()));
