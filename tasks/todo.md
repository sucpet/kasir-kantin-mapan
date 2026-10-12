# Tugas: Kasir Simpel

- [x] **T1: Migration `009_kasir_simpel.sql`**
  - Acceptance:
    - `orders.served_at timestamptz` dan `orders.queue_no integer` ada.
    - Trigger BEFORE INSERT mengisi `queue_no` = nomor terakhir hari itu (WIB) + 1, dengan advisory lock.
    - `fn_decrease_stock_on_item_insert` selalu mengurangi stok; `trg_decrease_stock_on_pay` dihapus.
    - RPC `order_progress(p_order_id uuid)` mengembalikan `{status, served_at, queue_no}` (anon + authenticated).
    - Baris `done` tidak berubah. `order_status` lama tetap ada.
    - `lib/types.ts`: `served_at: string | null`, `queue_no: number | null`.
  - Verify: tes PGlite (nomor berurutan dan mulai dari 1 lagi besok, stok berkurang sekali saat dibuat dan tidak lagi saat lunas, baris `done` tetap); `tsc`. Calvin menjalankan SQL; saya cek RPC dari luar.
  - Files: `supabase/migrations/009_kasir_simpel.sql`, `lib/types.ts`

- [x] **T2: Layar Antrian + PayModal**
  - Acceptance:
    - Grid kartu (2 kolom landscape). Setiap kartu menampilkan nomor antrian, nama (jika bukan "Tamu"), semua item ×jumlah, catatan, label besar Makan di Tempat/Bungkus, penanda 📱 untuk pesanan mandiri, dan status "Sedang disiapkan / Sudah disajikan" + "Belum bayar / Lunas".
    - Tombol besar **✅ Sudah Disajikan** (mengisi `served_at`) dan **💰 Lunas** (membuka PayModal).
    - PayModal:
      - QRIS: satu ketukan; nominal = total, atau total + kode unik untuk pesanan mandiri.
      - Tunai: tombol 5rb/10rb/20rb/50rb/100rb yang dijumlahkan, input yang bisa diedit, tombol Hapus, kembalian besar; Simpan nonaktif kalau uang kurang.
    - Kartu hilang setelah disajikan dan lunas. Ada daftar "Selesai hari ini" yang bisa dilipat.
    - Badge angka di tab = jumlah pesanan di antrian.
    - Cetak struk mengikuti Auto Print seperti sekarang.
  - Verify: self-check `assert` untuk fungsi kembalian/penjumlahan nominal; `tsc`, `build`, lint; Calvin cek di tablet (checkpoint).
  - Files: `components/tabs/PesananTab.tsx`, `components/PayModal.tsx`, `lib/utils.ts` (fungsi kembalian), `components/App.tsx` (badge)

- [ ] **T3: Pesanan Baru disederhanakan**
  - Acceptance:
    - Panel kanan: keranjang (item besar, −/+), pilihan besar **Makan di Tempat / Bungkus**, nama opsional, satu tombol **Simpan**.
    - Pesanan disimpan `status: 'open'` dan langsung muncul di Antrian. Toast menampilkan nomor antrian ("Pesanan #12 disimpan").
    - Jalur "Bayar Sekarang / Orderan Terbuka" dan modal pembayaran lama dihapus. Varian dan catatan item tetap ada.
  - Verify: `tsc`, `build`, lint; hitung ketukan untuk Success Criteria #1 dengan membaca alur kode.
  - Files: `components/tabs/KasirTab.tsx`

- [ ] **T4: Navigasi 2 tab + ⚙️ Kelola dengan PIN**
  - Acceptance:
    - Header hanya berisi jam dan **⚙️ Kelola**. Tab bar: **➕ Pesanan Baru** dan **📋 Antrian (n)**, besar.
    - Kelola meminta PIN (atau membuat PIN pertama kali; disimpan sebagai SHA-256 di `settings.admin_pin_hash`).
    - Isi Kelola: Menu, Stok, Rekap, Pengaturan (+ ubah PIN Kelola), QR Pesan Mandiri, tema, Keluar. Kelola terkunci lagi saat ditutup.
    - Alert pesanan mandiri baru tetap muncul dan mengarahkan ke Antrian.
  - Verify: `tsc`, `build`, lint.
  - Files: `components/App.tsx`, `components/KelolaPanel.tsx`, `components/SettingsModal.tsx` (ubah PIN)

- [ ] **T5: `/order` + Rekap ikut model baru**
  - Acceptance:
    - `/order`: polling memakai `order_progress`, menampilkan nomor antrian, "Sedang dibuat / Siap diambil", dan "Belum bayar / Lunas".
    - Riwayat memakai `served_at`, dan poin di-refresh saat lunas.
    - Rekap: label "Tab" → "Belum bayar". Perhitungan pendapatan tidak berubah.
  - Verify: `tsc`, `build`, lint.
  - Files: `app/order/OrderPage.tsx`, `components/tabs/RekapTab.tsx`

- [ ] **T6: Uji papa/mama + dokumentasi**
  - Acceptance: Success Criteria #1–#8 di spec terpenuhi; bagian "Order lifecycle" di CLAUDE.md diperbarui.
  - Verify: papa/mama mencatat, menyajikan, dan melunasi 5 pesanan tanpa dibantu.
  - Files: `CLAUDE.md`
