create table if not exists inventory_items (
  id bigint primary key auto_increment,
  sku varchar(64) not null,
  inventory_available int not null,
  updated_at timestamp not null default current_timestamp
);

delete from inventory_items where sku in ('luna-lamp', 'aurora-desk', 'nova-chair');

insert into inventory_items (sku, inventory_available, updated_at)
values
  ('luna-lamp', 18, now()),
  ('aurora-desk', 8, now()),
  ('nova-chair', 24, now());
