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
