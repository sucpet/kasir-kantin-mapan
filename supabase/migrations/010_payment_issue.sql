-- Kasir bisa menandai pembayaran QRIS pesanan mandiri "belum masuk"; pelanggan melihatnya di /order.
-- Jalankan di Supabase Dashboard → SQL Editor (setelah 009).

alter table public.orders
  add column if not exists payment_issue_at timestamptz;  -- null = tidak ada masalah pembayaran

create or replace function public.order_progress(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', status, 'served_at', served_at, 'queue_no', queue_no,
                            'payment_issue_at', payment_issue_at)
    from orders where id = p_order_id;
$$;
grant execute on function public.order_progress(uuid) to anon, authenticated;
