-- Harga tambahan per pilihan menu (cth: + Nasi Rp 3.000).
-- menu_items.options: [{ name, choices: [..], prices?: { "<choice>": 3000 }, multi?: true }]
-- p_items[].opts: [{ "g": "<nama grup>", "c": "<pilihan>" }]; harga diambil dari server.

create or replace function public.option_extra(p_options jsonb, p_opts jsonb)
returns integer language sql immutable set search_path = public as $$
  select coalesce(sum(greatest(0, coalesce((g->'prices'->>(o->>'c'))::integer, 0))), 0)::integer
    from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) g
    join jsonb_array_elements(coalesce(p_opts, '[]'::jsonb)) o on o->>'g' = g->>'name'
$$;

-- Sama dengan 006, hanya harga item = harga menu + option_extra.
-- create or replace mempertahankan revoke anon dari 008.
create or replace function public.create_order(
  p_customer_name  text,
  p_customer_phone text,
  p_payment_method text,
  p_source         text,
  p_redeem_points  integer,
  p_dining_type    text,
  p_items          jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id        uuid;
  v_original_total  integer;
  v_customer_points integer := 0;
  v_pending_total   integer := 0;
  v_available       integer := 0;
  v_safe_redeem     integer := 0;
  v_net_total       integer;
  v_suffix          integer;
  v_new_points      integer := 0;
begin
  select coalesce(sum((m.price + option_extra(m.options, item->'opts')) * (item->>'qty')::integer), 0)
    into v_original_total
    from jsonb_array_elements(p_items) as item
    join public.menu_items m on m.id = (item->>'menu_item_id')::uuid
   where m.available = true;

  if p_customer_phone is not null then
    select coalesce(points, 0) into v_customer_points
      from public.customers
     where phone = p_customer_phone
       for update;

    select coalesce(sum(pending_redeem), 0) into v_pending_total
      from public.orders
     where customer_phone = p_customer_phone
       and status = 'open';

    v_available := greatest(0, v_customer_points - v_pending_total);

    if p_redeem_points > 0 then
      v_safe_redeem := least(p_redeem_points, v_available, v_original_total);
    end if;
  end if;

  v_net_total := v_original_total - v_safe_redeem;
  v_suffix    := case when v_safe_redeem > 0 then 0 else (floor(random() * 59) + 1)::integer end;

  insert into public.orders (
    customer_name, status, total, payment_method, source,
    customer_phone, dining_type, pending_redeem, points_to_earn
  )
  values (
    p_customer_name, 'open', v_net_total, p_payment_method, p_source,
    p_customer_phone, p_dining_type, v_safe_redeem, v_suffix
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, menu_item_id, name, price, qty, note)
  select
    v_order_id,
    m.id,
    coalesce(nullif(trim(item->>'display_name'), ''), m.name),
    m.price + option_extra(m.options, item->'opts'),
    (item->>'qty')::integer,
    nullif(trim(item->>'note'), '')
  from jsonb_array_elements(p_items) as item
  join public.menu_items m on m.id = (item->>'menu_item_id')::uuid;

  return jsonb_build_object(
    'order_id',       v_order_id,
    'original_total', v_original_total,
    'safe_redeem',    v_safe_redeem,
    'net_total',      v_net_total,
    'suffix',         v_suffix,
    'new_points',     v_new_points
  );
end;
$$;
