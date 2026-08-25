-- ============================================================
-- Kasir Kantin — Supabase Schema
-- Jalankan di: Supabase Dashboard → SQL Editor
-- ============================================================

-- Menu items
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  category text not null default 'Lainnya',
  available boolean not null default true,
  options jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default 'Tamu',
  status text not null default 'open' check (status in ('open', 'paid')),
  total integer not null default 0,
  paid_amount integer,
  note text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

-- Order items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade not null,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  price integer not null,
  qty integer not null,
  created_at timestamptz default now()
);

-- Indexes
create index on public.orders(status);
create index on public.orders(created_at desc);
create index on public.order_items(order_id);

-- RLS — aktifkan agar Supabase tidak reject request
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Policy: izinkan semua operasi (tanpa login)
create policy "public_all" on public.menu_items for all using (true) with check (true);
create policy "public_all" on public.orders for all using (true) with check (true);
create policy "public_all" on public.order_items for all using (true) with check (true);

-- ============================================================
-- Migration: jalankan ini jika tabel menu_items sudah ada
-- ============================================================
-- alter table public.menu_items add column if not exists options jsonb not null default '[]';
-- alter table public.order_items add column if not exists note text;
-- alter table public.orders add column if not exists payment_method text;
-- alter table public.orders add column if not exists source text not null default 'kasir';
-- alter table public.menu_items add column if not exists image_url text;

-- Migration: tambah status 'done' (sudah bayar & sudah disajikan)
-- alter table public.orders drop constraint orders_status_check;
-- alter table public.orders add constraint orders_status_check check (status in ('open', 'paid', 'done'));

-- Settings table (key-value untuk konfigurasi app seperti QRIS)
-- create table public.settings (key text primary key, value text);
-- create policy "public_all" on public.settings for all using (true) with check (true);

-- Customers & loyalty points
-- create table public.customers (
--   id uuid primary key default gen_random_uuid(),
--   phone text unique not null,
--   name text not null default '',
--   points integer not null default 0,
--   created_at timestamptz default now()
-- );
-- create policy "public_all" on public.customers for all using (true) with check (true);
-- alter table public.orders add column if not exists customer_phone text;

-- ============================================================
-- RPC: create_order — server-side total calculation (anti-tamper)
-- Jalankan ini di SQL Editor setelah tabel customers & orders ada
-- ============================================================
-- create or replace function public.create_order(
--   p_customer_name  text,
--   p_customer_phone text,
--   p_payment_method text,
--   p_source         text,
--   p_redeem_points  integer,
--   p_items          jsonb
-- ) returns jsonb language plpgsql security definer as $$
-- declare
--   v_order_id        uuid;
--   v_original_total  integer;
--   v_customer_points integer := 0;
--   v_safe_redeem     integer := 0;
--   v_net_total       integer;
--   v_suffix          integer;
--   v_new_points      integer := 0;
-- begin
--   -- Hitung total dari harga di server (bukan dari client)
--   select coalesce(sum(m.price * (item->>'qty')::integer), 0)
--     into v_original_total
--     from jsonb_array_elements(p_items) as item
--     join public.menu_items m on m.id = (item->>'menu_item_id')::uuid
--    where m.available = true;
--
--   -- Ambil poin customer dari DB, validasi redemption
--   if p_customer_phone is not null then
--     select coalesce(points, 0) into v_customer_points
--       from public.customers where phone = p_customer_phone;
--     if p_redeem_points > 0 then
--       v_safe_redeem := least(p_redeem_points, v_customer_points, v_original_total);
--     end if;
--   end if;
--
--   v_net_total := v_original_total - v_safe_redeem;
--   -- Tidak ada kode unik jika customer menukar poin
--   v_suffix    := case when v_safe_redeem > 0 then 0 else floor(random() * 400)::integer end;
--
--   -- Buat order
--   insert into public.orders (customer_name, status, total, payment_method, source, customer_phone)
--   values (p_customer_name, 'open', v_net_total, p_payment_method, p_source, p_customer_phone)
--   returning id into v_order_id;
--
--   -- Buat order_items dengan harga dari server; display_name untuk varian
--   insert into public.order_items (order_id, menu_item_id, name, price, qty, note)
--   select
--     v_order_id,
--     m.id,
--     coalesce(nullif(trim(item->>'display_name'), ''), m.name),
--     m.price,
--     (item->>'qty')::integer,
--     nullif(trim(item->>'note'), '')
--   from jsonb_array_elements(p_items) as item
--   join public.menu_items m on m.id = (item->>'menu_item_id')::uuid;
--
--   -- Update poin customer
--   if p_customer_phone is not null then
--     v_new_points := v_customer_points - v_safe_redeem + v_suffix;
--     update public.customers set points = v_new_points, name = p_customer_name
--      where phone = p_customer_phone;
--   end if;
--
--   return jsonb_build_object(
--     'order_id',       v_order_id,
--     'original_total', v_original_total,
--     'safe_redeem',    v_safe_redeem,
--     'net_total',      v_net_total,
--     'suffix',         v_suffix,
--     'new_points',     v_new_points
--   );
-- end;
-- $$;
-- grant execute on function public.create_order to anon, authenticated;

-- ============================================================
-- Storage: buat bucket "menu-images" (Public) di Supabase Dashboard
-- lalu jalankan policy ini di SQL Editor:
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true);
-- create policy "public read" on storage.objects for select using (bucket_id = 'menu-images');
-- create policy "auth upload" on storage.objects for insert with check (bucket_id = 'menu-images');

-- ============================================================
-- Seed data contoh (opsional, hapus jika tidak diperlukan)
-- ============================================================
insert into public.menu_items (name, price, category) values
  ('Nasi Goreng', 15000, 'Makanan'),
  ('Mie Goreng', 12000, 'Makanan'),
  ('Nasi + Ayam Goreng', 20000, 'Makanan'),
  ('Soto Ayam', 15000, 'Makanan'),
  ('Nasi Putih', 5000, 'Makanan'),
  ('Es Teh Manis', 5000, 'Minuman'),
  ('Es Jeruk', 8000, 'Minuman'),
  ('Kopi Hitam', 8000, 'Minuman'),
  ('Air Mineral', 3000, 'Minuman'),
  ('Gorengan', 2000, 'Snack'),
  ('Roti Bakar', 8000, 'Snack');
