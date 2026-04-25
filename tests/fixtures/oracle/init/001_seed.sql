begin
  execute immediate '
    create table accounts (
      id number primary key,
      name varchar2(128) not null,
      status varchar2(32) not null,
      updated_at timestamp default systimestamp not null
    )';
exception
  when others then
    if sqlcode != -955 then raise; end if;
end;
/

begin
  execute immediate '
    create table orders (
      order_id number primary key,
      account_id number not null,
      status varchar2(32) not null,
      total_amount number(12,2) not null,
      updated_at timestamp default systimestamp not null
    )';
exception
  when others then
    if sqlcode != -955 then raise; end if;
end;
/

begin
  execute immediate 'create index orders_account_status_idx on orders (account_id, status)';
exception
  when others then
    if sqlcode != -955 then raise; end if;
end;
/

merge into accounts target
using (
  select 1 id, 'Northwind' name, 'active' status from dual union all
  select 2 id, 'Contoso' name, 'active' status from dual union all
  select 3 id, 'Fabrikam' name, 'paused' status from dual
) source
on (target.id = source.id)
when matched then update set target.name = source.name, target.status = source.status, target.updated_at = systimestamp
when not matched then insert (id, name, status) values (source.id, source.name, source.status);

merge into orders target
using (
  select 101 order_id, 1 account_id, 'processing' status, 128.40 total_amount from dual union all
  select 102 order_id, 2 account_id, 'fulfilled' status, 88.00 total_amount from dual
) source
on (target.order_id = source.order_id)
when matched then update set target.status = source.status, target.total_amount = source.total_amount, target.updated_at = systimestamp
when not matched then insert (order_id, account_id, status, total_amount) values (source.order_id, source.account_id, source.status, source.total_amount);

commit;
