if db_id('datapadplusplus') is null
begin
  create database datapadplusplus;
end
go

use datapadplusplus;
go

if object_id('dbo.orders', 'U') is null
begin
  create table dbo.orders (
    order_id int primary key,
    status nvarchar(32) not null,
    updated_at datetime2 not null
  );
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

merge dbo.orders as target
using (
  values
    (101, 'processing', sysutcdatetime()),
    (102, 'fulfilled', sysutcdatetime()),
    (103, 'on-hold', sysutcdatetime())
) as source (order_id, status, updated_at)
on target.order_id = source.order_id
when matched then
  update set
    status = source.status,
    updated_at = source.updated_at
when not matched then
  insert (order_id, status, updated_at)
  values (source.order_id, source.status, source.updated_at);
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
