// Self-check logika antrian & pembayaran. Jalankan: node scripts/check-utils.mjs
import assert from 'node:assert/strict'
import { inQueue, isServed, qrisAmount, kembalian, customerStage } from '../lib/utils.ts'

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

assert.equal(customerStage({ status: 'open', served_at: null, payment_issue_at: null }), 'waiting')
assert.equal(customerStage({ status: 'open', served_at: null, payment_issue_at: now }), 'issue')
assert.equal(customerStage({ status: 'paid', served_at: null, payment_issue_at: now }), 'cooking', 'lunas mengalahkan flag lama')
assert.equal(customerStage({ status: 'paid', served_at: now, payment_issue_at: null }), 'ready')
assert.equal(customerStage({ status: 'done', served_at: null }), 'ready')

console.log('utils OK')

// Pilihan menu + harga tambahan
{
  const { togglePick, pickedComplete, pickedLine } = await import('../lib/utils.ts')
  const groups = [
    { name: 'Level', choices: ['Sedang', 'Pedas'] },
    { name: 'Tambahan', choices: ['+ Nasi', '+ Tahu'], prices: { '+ Nasi': 3000, '+ Tahu': 2000 }, multi: true },
  ]
  let p = {}
  assert.equal(pickedComplete(groups, p), false, 'Level wajib')
  p = togglePick(p, groups[0], 'Sedang'); p = togglePick(p, groups[0], 'Pedas')
  assert.deepEqual(p.Level, ['Pedas'], 'grup biasa: satu pilihan')
  assert.equal(pickedComplete(groups, p), true, 'Tambahan tidak wajib')
  p = togglePick(p, groups[1], '+ Tahu'); p = togglePick(p, groups[1], '+ Nasi')
  const line = pickedLine({ name: 'Ayam', price: 15000 }, groups, p)
  assert.equal(line.price, 20000)
  assert.equal(line.name, 'Ayam (Pedas, + Nasi, + Tahu)', 'urutan ikut menu, bukan urutan ketuk')
  p = togglePick(p, groups[1], '+ Nasi')
  assert.equal(pickedLine({ name: 'Ayam', price: 15000 }, groups, p).price, 17000, 'ketuk lagi = batal')
  const { isOptional } = await import('../lib/utils.ts')
  assert.equal(isOptional(groups[1]), true, 'data lama multi tanpa optional = opsional')
  const one = { name: 'Minum', choices: ['Teh', 'Jeruk'], optional: true }
  let q = togglePick({}, one, 'Teh'); q = togglePick(q, one, 'Jeruk')
  assert.deepEqual(q.Minum, ['Jeruk'], 'opsional maks 1')
  assert.deepEqual(togglePick(q, one, 'Jeruk').Minum, [], 'opsional: ketuk lagi = batal')
  assert.deepEqual(togglePick(p, groups[0], 'Pedas').Level, ['Pedas'], 'wajib: ketuk lagi tetap terpilih')
  const wajibMulti = { name: 'Lauk', choices: ['A', 'B'], multi: true, optional: false }
  assert.equal(pickedComplete([wajibMulti], {}), false, 'wajib + boleh banyak tetap harus pilih')
  console.log('options OK')
}
