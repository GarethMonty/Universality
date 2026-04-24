if db_id('universality') is null
begin
  create database universality;
end
go

use universality;
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
