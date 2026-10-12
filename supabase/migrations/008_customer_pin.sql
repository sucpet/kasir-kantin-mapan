-- PIN 6 digit untuk pelanggan /order + token sesi.
-- Semua RPC pelanggan kini butuh token dari customer_login/customer_register,
-- jadi nomor HP saja tidak cukup untuk melihat riwayat atau memakai poin.
-- Jalankan di Supabase Dashboard → SQL Editor (setelah 007).

alter table public.customers
  add column if not exists pin_hash         text,
  add column if not exists pin_failed       integer not null default 0,
  add column if not exists pin_locked_until timestamptz,
  add column if not exists session_token    uuid,
  add column if not exists session_expires  timestamptz;

-- RPC lama berbasis nomor HP: hapus, dan tutup create_order untuk anon
drop function if exists public.customer_login(text);
drop function if exists public.customer_register(text, text);
drop function if exists public.customer_orders(text);
revoke execute on function public.create_order(text,text,text,text,integer,text,jsonb) from public, anon;

-- Internal: nomor HP dari token yang masih berlaku (tidak bisa dipanggil client)
create or replace function public.customer_phone_from_token(p_token uuid)
returns text language sql stable security definer set search_path = public as $$
  select phone from customers where session_token = p_token and session_expires > now();
$$;
revoke execute on function public.customer_phone_from_token(uuid) from public, anon, authenticated;

-- Internal: buat sesi baru (15 menit) & reset penghitung salah PIN
create or replace function public.customer_new_session(p_phone text)
returns jsonb language sql security definer set search_path = public as $$
  update customers
     set session_token = gen_random_uuid(), session_expires = now() + interval '15 minutes',
         pin_failed = 0, pin_locked_until = null
   where phone = p_phone
  returning jsonb_build_object('status', 'ok', 'token', session_token, 'name', name, 'points', points);
$$;
revoke execute on function public.customer_new_session(text) from public, anon, authenticated;

-- 'not_found' | 'needs_pin' (pelanggan lama / PIN di-reset kasir) | 'has_pin'
create or replace function public.customer_check(p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select case when pin_hash is null then 'needs_pin' else 'has_pin' end
                     from customers where phone = p_phone), 'not_found');
$$;

-- Login dengan PIN. Jika belum punya PIN, PIN ini jadi PIN-nya.
-- 5x salah → terkunci 15 menit. Return status (bukan raise) agar update penghitung tidak di-rollback.
create or replace function public.customer_login(p_phone text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c        customers%rowtype;
  v_failed integer;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('status', 'invalid_pin');
  end if;
  select * into c from customers where phone = p_phone for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if c.pin_locked_until > now() then
    return jsonb_build_object('status', 'locked', 'until', c.pin_locked_until);
  end if;
  if c.pin_hash is null then
    update customers set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where phone = p_phone;
  elsif c.pin_hash <> extensions.crypt(p_pin, c.pin_hash) then
    v_failed := case when c.pin_locked_until is not null then 0 else c.pin_failed end + 1;
    update customers
       set pin_failed = v_failed,
           pin_locked_until = case when v_failed >= 5 then now() + interval '15 minutes' end
     where phone = p_phone;
    if v_failed >= 5 then
      return jsonb_build_object('status', 'locked', 'until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('status', 'wrong_pin', 'remaining', 5 - v_failed);
  end if;
  return customer_new_session(p_phone);
end $$;

create or replace function public.customer_register(p_phone text, p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(coalesce(p_name, '')), 50);
begin
  if p_phone !~ '^08[0-9]{8,13}$' or v_name = '' or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'invalid input';
  end if;
  insert into customers (phone, name, points, pin_hash)
  values (p_phone, v_name, 0, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return customer_new_session(p_phone);
end $$;

create or replace function public.customer_me(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'points', points)
    from customers where phone = customer_phone_from_token(p_token);
$$;

create or replace function public.customer_orders(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by created_at desc), '[]'::jsonb) from (
    select o.created_at,
           to_jsonb(o) || jsonb_build_object('order_items',
             coalesce((select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id = o.id), '[]'::jsonb)) as x
      from orders o
     where o.customer_phone = customer_phone_from_token(p_token)
     order by o.created_at desc
     limit 20
  ) s;
$$;

-- Order dari /order. Token null = tamu (tanpa poin).
create or replace function public.customer_create_order(
  p_token          uuid,
  p_customer_name  text,
  p_payment_method text,
  p_redeem_points  integer,
  p_dining_type    text,
  p_items          jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if p_token is not null then
    v_phone := customer_phone_from_token(p_token);
    if v_phone is null then raise exception 'session expired'; end if;
  end if;
  return create_order(p_customer_name, v_phone, p_payment_method, 'customer',
                      case when v_phone is null then 0 else p_redeem_points end,
                      p_dining_type, p_items);
end $$;

grant execute on function public.customer_check(text)              to anon, authenticated;
grant execute on function public.customer_login(text, text)        to anon, authenticated;
grant execute on function public.customer_register(text, text, text) to anon, authenticated;
grant execute on function public.customer_me(uuid)                 to anon, authenticated;
grant execute on function public.customer_orders(uuid)             to anon, authenticated;
grant execute on function public.customer_create_order(uuid, text, text, integer, text, jsonb) to anon, authenticated;
