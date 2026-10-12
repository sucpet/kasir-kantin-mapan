// Self-check logika antrian & pembayaran. Jalankan: node scripts/check-utils.mjs
import assert from 'node:assert/strict'
import { inQueue, isServed, qrisAmount, kembalian } from '../lib/utils.ts'

const now = '2026-10-12T05:00:00Z'
assert.equal(inQueue({ status: 'open', served_at: null }), true)
assert.equal(inQueue({ status: 'open', served_at: now }), true, 'disajikan tapi belum bayar tetap di antrian')
assert.equal(inQueue({ status: 'paid', served_at: null }), true, 'lunas tapi belum disajikan tetap di antrian')
assert.equal(inQueue({ status: 'paid', served_at: now }), false)
assert.equal(inQueue({ status: 'done', served_at: null }), false, "'done' lama = selesai")
assert.equal(isServed({ status: 'done', served_at: null }), true)
assert.equal(isServed({ status: 'paid', served_at: null }), false)

assert.equal(qrisAmount({ total: 47000, points_to_earn: 37, source: 'customer' }), 47037)
assert.equal(qrisAmount({ total: 47000, points_to_earn: 0, source: 'kasir' }), 47000)

assert.equal(kembalian(47000, 50000 + 20000), 23000)
assert.equal(kembalian(47000, 47000), 0)
assert.ok(kembalian(47000, 20000) < 0, 'uang kurang')

console.log('utils OK')
