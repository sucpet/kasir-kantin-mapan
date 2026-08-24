import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Baca .env.local
const env = readFileSync('.env.local', 'utf8')
const get = (key) => env.match(new RegExp(`${key}=(.+)`))?.[1]?.trim()

const supabase = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

const EMAIL = 'admin@admin.com'
const PASSWORD = 'admin123'

console.log('🔐 Testing login:', EMAIL)

const { data, error } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
})

if (error) {
  console.error('❌ Login GAGAL:', error.message)
  process.exit(1)
}

console.log('✅ Login BERHASIL:', data.user?.email)
await supabase.auth.signOut()
