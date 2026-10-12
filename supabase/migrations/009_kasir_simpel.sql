-- Kasir simpel (docs/SPEC-kasir-simpel.md):
-- status bayar & status sajikan dipisah, nomor antrian harian, stok berkurang saat pesanan dibuat.
-- Aman dijalankan sebelum kode baru dideploy. Jalankan di Supabase Dashboard → SQL Editor.

-- 1. Kolom baru
alter table public.orders
  add column if not exists served_at timestamptz,  -- null = sedang disiapkan
  add column if not exists queue_no  integer;      -- nomor antrian per hari (WIB)

-- 2. Nomor antrian otomatis: nomor terakhir hari itu (WIB) + 1
create or replace function public.fn_assign_queue_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_day   date := (new.created_at at time zone 'Asia/Jakarta')::date;
  v_start timestamptz := v_day::timestamp at time zone 'Asia/Jakarta';
begin
  if new.queue_no is null then
    -- kunci per hari agar pesanan kasir & mandiri yang bersamaan tidak dapat nomor sama
    perform pg_advisory_xact_lock(hashtext('orders_queue_no'), v_day - date '2000-01-01');
    select coalesce(max(queue_no), 0) + 1 into new.queue_no
      from orders
     where created_at >= v_start and created_at < v_start + interval '1 day';
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_queue_no on public.orders;
create trigger trg_assign_queue_no
  before insert on public.orders
  for each row execute function public.fn_assign_queue_no();

-- 3. Stok berkurang saat item pesanan disimpan (bukan saat lunas)
drop trigger if exists trg_decrease_stock_on_pay on public.orders;
drop function if exists public.fn_decrease_stock_on_pay();

create or replace function public.fn_decrease_stock_on_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.menu_item_id is not null then
    update menu_items
       set stock = greatest(0, stock - new.qty)
     where id = new.menu_item_id
       and stock is not null;
  end if;
  return new;
end $$;

-- 4. Progres pesanan untuk halaman /order (order_status lama tetap ada sampai kode baru live)
create or replace function public.order_progress(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', status, 'served_at', served_at, 'queue_no', queue_no)
    from orders where id = p_order_id;
$$;
grant execute on function public.order_progress(uuid) to anon, authenticated;
