-- Kunci akses database: hanya kasir (login) yang boleh baca/tulis tabel.
-- Halaman /order (anon) hanya boleh baca menu & QRIS, sisanya lewat RPC.
-- Jalankan di Supabase Dashboard → SQL Editor.

-- 1. Hapus semua policy lama (termasuk "public_all") & aktifkan RLS di semua tabel public
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('create policy staff_all on public.%I for all to authenticated using (true) with check (true)', r.tablename);
  end loop;
end $$;

-- 2. Anon: hanya baca menu & gambar QRIS
create policy anon_read_menu on public.menu_items for select to anon using (true);
create policy anon_read_qris on public.settings for select to anon using (key = 'qris_image_url');

-- 3. RPC untuk halaman /order
create or replace function public.customer_login(p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'points', points) from customers where phone = p_phone;
$$;

create or replace function public.customer_register(p_phone text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(coalesce(p_name, '')), 50);
begin
  if p_phone !~ '^08[0-9]{8,13}$' or v_name = '' then
    raise exception 'invalid input';
  end if;
  insert into customers (phone, name, points) values (p_phone, v_name, 0);
  return jsonb_build_object('name', v_name, 'points', 0);
end $$;

create or replace function public.customer_orders(p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by created_at desc), '[]'::jsonb) from (
    select o.created_at,
           to_jsonb(o) || jsonb_build_object('order_items',
             coalesce((select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id = o.id), '[]'::jsonb)) as x
      from orders o
     where o.customer_phone = p_phone
     order by o.created_at desc
     limit 20
  ) s;
$$;

create or replace function public.order_status(p_order_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select status from orders where id = p_order_id;
$$;

grant execute on function public.customer_login(text)          to anon, authenticated;
grant execute on function public.customer_register(text, text) to anon, authenticated;
grant execute on function public.customer_orders(text)         to anon, authenticated;
grant execute on function public.order_status(uuid)            to anon, authenticated;

-- 4. Storage: upload foto/QRIS hanya untuk kasir yang login
drop policy if exists "auth upload" on storage.objects;
create policy "auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'menu-images');
