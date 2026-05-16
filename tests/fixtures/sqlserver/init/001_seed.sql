if db_id('datapadplusplus') is null
begin
  create database datapadplusplus;
end
go

use datapadplusplus;
go

if object_id('dbo.accounts', 'U') is null
begin
  create table dbo.accounts (
    id int primary key,
    name nvarchar(128) not null,
    status nvarchar(32) not null,
    tier nvarchar(32) not null,
    updated_at datetime2 not null
  );
end
go

if object_id('dbo.products', 'U') is null
begin
  create table dbo.products (
    sku nvarchar(64) primary key,
    name nvarchar(128) not null,
    category nvarchar(64) not null,
    inventory_available int not null,
    price decimal(12, 2) not null,
    updated_at datetime2 not null
  );
end
go

if object_id('dbo.orders', 'U') is null
begin
  create table dbo.orders (
    order_id int primary key,
    account_id int null,
    status nvarchar(32) not null,
    total_amount decimal(12, 2) null,
    updated_at datetime2 not null
  );
end
go

if col_length('dbo.orders', 'account_id') is null
begin
  alter table dbo.orders add account_id int null;
end
go

if col_length('dbo.orders', 'total_amount') is null
begin
  alter table dbo.orders add total_amount decimal(12, 2) null;
end
go

if object_id('dbo.perf_events', 'U') is null
begin
  create table dbo.perf_events (
    id bigint primary key,
    account_id int not null,
    region nvarchar(32) not null,
    event_name nvarchar(64) not null,
    amount decimal(12, 2) not null,
    created_at datetime2 not null
  );

  create index ix_perf_events_account_created on dbo.perf_events (account_id, created_at);
  create index ix_perf_events_region on dbo.perf_events (region);
end
go

merge dbo.accounts as target
using (
  values
    (1, 'Northwind', 'active', 'enterprise', sysutcdatetime()),
    (2, 'Contoso', 'active', 'growth', sysutcdatetime()),
    (3, 'Fabrikam', 'paused', 'starter', sysutcdatetime())
) as source (id, name, status, tier, updated_at)
on target.id = source.id
when matched then
  update set
    name = source.name,
    status = source.status,
    tier = source.tier,
    updated_at = source.updated_at
when not matched then
  insert (id, name, status, tier, updated_at)
  values (source.id, source.name, source.status, source.tier, source.updated_at);
go

merge dbo.products as target
using (
  values
    ('luna-lamp', 'Luna Lamp', 'lighting', 18, 49.99, sysutcdatetime()),
    ('aurora-desk', 'Aurora Desk', 'furniture', 8, 349.00, sysutcdatetime()),
    ('nova-chair', 'Nova Chair', 'furniture', 24, 129.50, sysutcdatetime())
) as source (sku, name, category, inventory_available, price, updated_at)
on target.sku = source.sku
when matched then
  update set
    name = source.name,
    category = source.category,
    inventory_available = source.inventory_available,
    price = source.price,
    updated_at = source.updated_at
when not matched then
  insert (sku, name, category, inventory_available, price, updated_at)
  values (source.sku, source.name, source.category, source.inventory_available, source.price, source.updated_at);
go

merge dbo.orders as target
using (
  values
    (101, 1, 'processing', 128.40, sysutcdatetime()),
    (102, 2, 'fulfilled', 88.00, sysutcdatetime()),
    (103, 1, 'on-hold', 42.50, sysutcdatetime())
) as source (order_id, account_id, status, total_amount, updated_at)
on target.order_id = source.order_id
when matched then
  update set
    account_id = source.account_id,
    status = source.status,
    total_amount = source.total_amount,
    updated_at = source.updated_at
when not matched then
  insert (order_id, account_id, status, total_amount, updated_at)
  values (source.order_id, source.account_id, source.status, source.total_amount, source.updated_at);
go

merge dbo.perf_events as target
using (
  select top (100000)
    row_number() over (order by first_source.object_id, second_source.object_id) as id
  from sys.all_objects first_source
  cross join sys.all_objects second_source
) as generated
on target.id = generated.id
when matched then
  update set
    account_id = (generated.id % 250) + 1,
    region = case generated.id % 5
      when 0 then 'eu-west-1'
      when 1 then 'us-east-1'
      when 2 then 'ap-southeast-1'
      when 3 then 'af-south-1'
      else 'local'
    end,
    event_name = case generated.id % 4
      when 0 then 'order.created'
      when 1 then 'order.updated'
      when 2 then 'inventory.adjusted'
      else 'session.heartbeat'
    end,
    amount = cast(((generated.id % 10000) / 3.0) + 10 as decimal(12, 2)),
    created_at = dateadd(second, -(generated.id % 43200), sysutcdatetime())
when not matched then
  insert (id, account_id, region, event_name, amount, created_at)
  values (
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
    cast(((generated.id % 10000) / 3.0) + 10 as decimal(12, 2)),
    dateadd(second, -(generated.id % 43200), sysutcdatetime())
  );
go
