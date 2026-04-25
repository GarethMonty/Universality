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
