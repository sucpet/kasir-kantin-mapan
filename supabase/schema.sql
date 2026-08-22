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
