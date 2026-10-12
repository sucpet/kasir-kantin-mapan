# Spec: Kasir Simpel untuk Papa/Mama

Status: **disetujui (2026-10-12)**

## Objective

Papa/mama (±50 tahun, tidak terbiasa dengan aplikasi) mencatat setiap pesanan lisan di tablet supaya **tidak ada pesanan yang terlupa**. Saat ini pesanan hanya diingat atau ditulis di kertas, dan kadang terlewat saat ramai.

Pengguna: papa/mama, di tablet Samsung ±8 inci, **mendatar (landscape)**. Pengelola menu, stok, dan rekap: Calvin.

### User stories

1. **Catat pesanan.** Pelanggan menyebut pesanan. Papa/mama mengetuk menu → memilih **Makan di Tempat / Bungkus** → **Simpan**. Nama pelanggan **opsional**; setiap pesanan otomatis mendapat **nomor antrian** (#1, #2, …, mulai lagi dari 1 setiap hari).
2. **Lihat antrian.** Semua pesanan yang belum beres terlihat sekaligus, dalam grid kartu besar. Setiap kartu menampilkan **nomor antrian**, nama (jika ada), item, jumlah, catatan, dan label besar **🍽️ Makan di Tempat / 🥡 Bungkus** tanpa perlu diketuk.
3. **Tandai disajikan.** Satu tombol besar **✅ Sudah Disajikan**.
4. **Catat pembayaran kapan saja** (sebelum atau sesudah makan) lewat tombol besar **💰 Lunas**:
   - **QRIS:** satu ketukan, langsung lunas.
   - **Tunai:** tombol **5.000 / 10.000 / 20.000 / 50.000 / 100.000** yang **dijumlahkan**, kotak nominal yang tetap bisa diketik atau diubah, tombol **Hapus**, dan **kembalian** ditampilkan besar. Tombol "Simpan" tidak aktif kalau uang kurang.
5. **Order mandiri (QR)** tetap jalan dan masuk ke antrian yang sama, dengan penanda "📱 Pesan sendiri" dan nomor antrian.
6. Pesanan **hilang dari antrian** hanya jika sudah **disajikan DAN lunas**.

## Keputusan desain

### Model status: bayar dan sajikan dipisah

Saat ini `orders.status` menggabungkan dua hal: `open` (belum bayar) → `paid` (sudah bayar *dan* sedang dimasak) → `done` (disajikan). Alur baru butuh keduanya terpisah ("sudah disajikan tapi belum bayar").

- `status` tetap berarti **status bayar**: `open` = belum bayar, `paid` = lunas. Poin pelanggan tetap masuk saat `open → paid` (trigger live, tidak diubah).
- **Kolom baru `orders.served_at timestamptz`** = waktu disajikan (`null` = sedang disiapkan).
- `done` = **data lama**, diperlakukan sebagai "lunas + disajikan". Kode baru tidak pernah menulis `done`. Baris `done` tidak diubah ke `paid` karena itu akan memicu trigger poin dua kali.
- Antrian = belum lunas **atau** belum disajikan (kecuali `done`).

### Nomor antrian

- **Kolom baru `orders.queue_no integer`**, diisi oleh trigger database saat insert: nomor terakhir hari itu (zona waktu Asia/Jakarta) + 1. Trigger memakai lock supaya pesanan kasir dan pesanan mandiri yang masuk bersamaan tidak mendapat nomor sama.
- `customer_name` opsional di Pesanan Baru. Kalau kosong, DB mengisi default `'Tamu'`, dan tampilan hanya menunjukkan nomor antrian.

### Stok berkurang saat pesanan masuk antrian

- Sesuai keputusan: stok berkurang saat pesanan berstatus **sedang disiapkan**, yaitu **saat dibuat**, bukan saat lunas.
- Migration mengganti `fn_decrease_stock_on_item_insert` supaya selalu mengurangi stok saat item disimpan, dan **menghapus** `trg_decrease_stock_on_pay` supaya tidak terjadi pengurangan dua kali.
- Konsekuensi transisi: pesanan `open` yang dibuat **sebelum** migration belum mengurangi stok dan tidak akan menguranginya saat dilunasi (selisih sekali, kecil).
- Belum ada fitur batal pesanan, jadi belum ada pengembalian stok. Kalau fitur batal ditambah nanti, stok harus dikembalikan.

### Navigasi untuk papa/mama

- Tampilan utama hanya **2 tab besar**: **➕ Pesanan Baru** dan **📋 Antrian (angka)**.
- Header hanya berisi jam dan tombol **⚙️ Kelola**.
- **Kelola** dikunci **PIN Kelola** (angka). Isinya: Menu, Stok, Rekap, Pengaturan (QRIS, printer, reset PIN pelanggan, ubah PIN Kelola), QR Pesan Mandiri, ganti tema, dan Keluar (logout). Semua dipindah tanpa diubah isinya.
- PIN Kelola disimpan sebagai hash SHA-256 di `settings` (key `admin_pin_hash`). Tujuannya mencegah salah tekan, bukan pengamanan dari penyerang. Kalau belum diset, membuka Kelola pertama kali meminta PIN dibuat. Kelola terkunci lagi setiap kali ditutup.
- Istilah "Tab Terbuka", "Orderan Terbuka", "Bayar Sekarang", dan "Selesai Disajikan" dihapus dari tampilan papa/mama.

### Halaman pelanggan `/order`

Status ditampilkan berdasarkan `served_at`: "Sedang dibuat" → "Siap diambil". Pembayaran ditampilkan terpisah ("Belum bayar / Lunas"), plus nomor antrian. RPC `order_status` dan `customer_orders` ikut mengembalikan `served_at` dan `queue_no`.

### Tidak berubah

Cetak struk otomatis tetap mengikuti pengaturan Auto Print seperti sekarang (masih dalam pengembangan dan akan ditanyakan ke papa/mama).

## Tech Stack

Next.js 16.3.2 (App Router, Turbopack), React 19.2, Tailwind 4, Supabase (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.112). Tidak ada dependency baru.

## Commands

```bash
npx tsc --noEmit                        # typecheck
npx eslint <file yang diubah>           # lint (bandingkan dengan baseline; ada error lama)
npm run build                           # build produksi (butuh .env.local)
npm run dev                             # cek manual di http://localhost:3000
```

## Project Structure

```
components/App.tsx              → header (jam + ⚙️ Kelola) + 2 tab besar
components/KelolaPanel.tsx      → BARU: kunci PIN + isi Kelola (Menu/Stok/Rekap/Pengaturan/QR/tema/Keluar)
components/tabs/KasirTab.tsx    → jadi "Pesanan Baru" (nama opsional, Simpan langsung)
components/tabs/PesananTab.tsx  → jadi "Antrian" (grid kartu besar, Sajikan + Lunas)
components/PayModal.tsx         → BARU: modal Lunas (QRIS / Tunai + kembalian)
components/tabs/{Menu,Stok,Rekap}Tab.tsx, SettingsModal.tsx, QRModal.tsx → isi tidak diubah
app/order/OrderPage.tsx         → status Sedang dibuat/Siap + Belum bayar/Lunas + nomor antrian
lib/types.ts                    → Order.served_at, Order.queue_no
supabase/migrations/009_kasir_simpel.sql → BARU: served_at, queue_no + trigger, trigger stok, update RPC
docs/SPEC-kasir-simpel.md       → spec ini
```

## Code Style

Ikuti pola yang sudah ada: komponen client, query Supabase langsung, warna lewat CSS variable, ukuran font lewat `--fs`. Untuk papa/mama: tombol utama minimal setinggi ±56px, teks tombol tanpa singkatan.

```tsx
<button
  onClick={() => markServed(order)}
  className="flex-1 py-4 rounded-xl bg-[var(--color-success)] text-white text-[length:calc(16px*var(--fs))] font-extrabold"
>
  ✅ Sudah Disajikan
</button>
```

## Testing Strategy

Repo tidak punya test suite, dan Playwright hanya dijalankan kalau diminta.

- Setiap tahap: `tsc`, `build`, dan lint file yang diubah tanpa error baru.
- Migration diuji di PGlite (scratchpad):
  - nomor antrian berurutan dan mulai dari 1 lagi di hari berikutnya (WIB)
  - stok berkurang tepat sekali saat pesanan dibuat, dan tidak berkurang lagi saat dilunasi
  - baris `done` tidak berubah
- Logika kembalian/nominal: satu self-check kecil (fungsi murni + `assert`).
- Uji akhir: **papa/mama mencoba langsung di tablet** (lihat Success Criteria).

## Boundaries

- **Always:** pertahankan arti `status` sebagai status bayar; pakai CSS variable dan `--fs`; satu tahap per commit.
- **Ask first:** migration database (Calvin yang menjalankannya di SQL Editor sebelum push); menghapus fitur yang ada (print struk, catatan item, pilihan varian); dependency baru.
- **Never:** mengubah baris `done` menjadi `paid`; mengubah trigger poin; menjalankan Playwright tanpa diminta.

## Success Criteria

1. Pesanan 3 item (salah satunya dengan varian) bisa dicatat dalam **≤ 4 ketukan setelah memilih menu** (Makan di Tempat/Bungkus → Simpan, tanpa mengetik).
2. Setiap kartu antrian menampilkan nomor antrian, item, jumlah, catatan, dan Makan di Tempat/Bungkus **tanpa diketuk**, terbaca dari jarak ±50 cm di tablet 8 inci landscape.
3. Pesanan tetap ada di antrian sampai **disajikan dan lunas**, dalam urutan apa pun.
4. Bayar QRIS = 1 ketukan setelah **Lunas**. Bayar tunai 50.000 + 20.000 untuk total 47.000 menampilkan **kembalian Rp 23.000**.
5. Order mandiri dari `/order` muncul di antrian yang sama dengan nomor antrian, dan pelanggan melihat "Siap diambil" setelah ditandai disajikan.
6. Stok berkurang tepat sekali saat pesanan dibuat. Poin bertambah tepat sekali saat lunas.
7. Menu, Stok, Rekap, dan Pengaturan tidak bisa dibuka tanpa PIN Kelola.
8. Papa/mama bisa mencatat, menyajikan, dan melunasi 5 pesanan berturut-turut **tanpa dibantu**.

## Open Questions

Tidak ada. Semua pertanyaan v1 sudah dijawab:
nama opsional + nomor antrian harian, tablet landscape, stok berkurang saat dibuat, Kelola dikunci PIN, dan cetak struk tidak diubah.
