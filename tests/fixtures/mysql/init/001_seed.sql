create table if not exists inventory_items (
  id bigint primary key auto_increment,
  sku varchar(64) not null,
  inventory_available int not null,
  updated_at timestamp not null default current_timestamp
);

insert into inventory_items (sku, inventory_available, updated_at)
values
  ('luna-lamp', 18, now()),
  ('aurora-desk', 8, now()),
  ('nova-chair', 24, now())
on duplicate key update
  inventory_available = values(inventory_available),
  updated_at = values(updated_at);
