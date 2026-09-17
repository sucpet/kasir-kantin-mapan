/**
 * Supabase keepalive — insert + delete satu record dummy agar DB tidak di-pause.
 * Jalankan manual: npm run keepalive
 * Otomatis: GitHub Actions (.github/workflows/keepalive.yml) setiap 3 hari.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY harus di-set.')
  console.error('Lokal: npm run keepalive  (membaca .env.local otomatis)')
  process.exit(1)
}

const supabase = createClient(url, key)

const KEEPALIVE_NAME = '__keepalive__'

// Hapus sisa keepalive lama (jika ada dari run sebelumnya yang gagal)
await supabase.from('menu_items').delete().eq('name', KEEPALIVE_NAME)

// Insert record dummy
const { data, error } = await supabase
  .from('menu_items')
  .insert({ name: KEEPALIVE_NAME, price: 0, category: '__system__', available: false })
  .select('id')
  .single()

if (error) {
  console.error('Keepalive GAGAL (insert):', error.message)
  process.exit(1)
}

// Hapus langsung
const { error: delError } = await supabase.from('menu_items').delete().eq('id', data.id)

if (delError) {
  console.error('Keepalive GAGAL (delete):', delError.message)
  process.exit(1)
}

console.log(`✅ Keepalive berhasil — ${new Date().toISOString()}`)
