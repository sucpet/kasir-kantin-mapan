export function rp(n: number): string {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export function fmtTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
  const today = todayStr()
  const yesterday = shiftDate(today, -1)
  const label = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  if (dateStr === today) return `Hari ini — ${label}`
  if (dateStr === yesterday) return `Kemarin — ${label}`
  return label
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function shiftDate(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function dateKey(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function p2(n: number): string {
  return String(n).padStart(2, '0')
}

export function orderSum(items: { price: number; qty: number }[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0)
}
