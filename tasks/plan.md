# Rencana: Kasir Simpel

Spec: `docs/SPEC-kasir-simpel.md` (disetujui 2026-10-12)

## Urutan dan alasan

```
T1 Migration ──→ T2 Antrian ──→ T3 Pesanan Baru ──→ T4 Navigasi + Kelola PIN ──→ T5 /order + Rekap ──→ T6 Uji di tablet
```

1. **T1 Migration dulu**, karena semua tahap lain membaca `served_at` / `queue_no`. Migration-nya **aman dijalankan sebelum kode baru dideploy**:
   - kolom baru nullable, dan trigger `queue_no` mengisi otomatis
   - trigger stok hanya berpindah waktu (dari saat lunas ke saat dibuat)
   - status pesanan untuk `/order` lewat **RPC baru `order_progress`**; `order_status` lama tetap ada sampai T5, supaya halaman pelanggan yang sedang live tidak rusak
   - `customer_orders` sudah memakai `to_jsonb(o)`, jadi kolom baru ikut otomatis
2. **T2 Antrian sebelum T3**, karena itu yang paling berdampak: dengan alur input lama pun, papa/mama sudah bisa melihat pesanan dengan jelas. Ini juga tempat PayModal dibuat, yang nanti dipakai ulang.
3. **T3 Pesanan Baru**: hapus jalur "Bayar Sekarang / Orderan Terbuka". Semua pesanan disimpan sebagai belum lunas, lalu dilunasi lewat Antrian.
4. **T4 Navigasi**: dikerjakan setelah dua layar utama jadi, supaya penataan tab dilakukan sekali saja.
5. **T5 Halaman pelanggan dan Rekap** menyesuaikan model status baru.
6. **T6** adalah uji oleh papa/mama, ditambah memperbarui bagian "Order lifecycle" di CLAUDE.md.

## Checkpoint

- **Setelah T1:** Calvin menjalankan SQL di Supabase. Saya cek dari luar: RPC `order_progress` ada, dan `/order` yang live masih jalan.
- **Setelah T2:** Calvin mencoba Antrian di tablet. Saya hanya lanjut ke T3 kalau tampilan kartunya sudah oke, karena gaya kartu ini dipakai di tahap berikutnya.
- **Setelah T4:** seluruh alur papa/mama sudah lengkap. Siap untuk T6.

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Deploy saat kantin sedang ramai | Setiap tahap 1 commit kecil. Push saat sepi kalau ada perubahan perilaku (T2, T3, T4). |
| Stok terpotong dua kali saat transisi | T1 menghapus trigger "on pay" dalam transaksi yang sama dengan penggantian trigger "on insert". Diuji di PGlite. |
| Dua pesanan mendapat nomor antrian sama | Trigger memakai `pg_advisory_xact_lock` per hari. Diuji di PGlite. |
| Nominal QRIS pesanan mandiri | Total + kode unik (`points_to_earn`), sama seperti logika `confirmSettleMandiri` sekarang. PayModal memakai rumus itu. |
| Baris `done` lama | Tidak disentuh. Kode memperlakukan `done` = lunas + disajikan. |
| Pesanan `open` dari sebelum migration | Tidak mengurangi stok. Diterima (selisih sekali, tercatat di spec). |
| PIN Kelola lupa | Calvin bisa menghapus `admin_pin_hash` di tabel `settings`, lalu membuat PIN baru saat membuka Kelola. |
