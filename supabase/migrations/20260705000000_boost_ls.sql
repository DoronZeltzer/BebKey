-- Boosts now go through Lemon Squeezy (one-time orders), not Paddle.
-- Rename the payment-ref column on boost_orders accordingly.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'boost_orders' and column_name = 'paddle_txn'
  ) then
    alter table public.boost_orders rename column paddle_txn to ls_order_id;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'boost_orders' and column_name = 'ls_order_id'
  ) then
    alter table public.boost_orders add column ls_order_id text;
  end if;
end $$;
