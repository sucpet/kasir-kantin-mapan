// BLE Thermal Printer — Web Bluetooth API
// Hanya bekerja di Chrome Android (HTTPS atau localhost)

let _device: BluetoothDevice | null = null
let _char: BluetoothRemoteGATTCharacteristic | null = null
let _disconnectCb: (() => void) | null = null

// UUID service/characteristic untuk printer BLE yang umum
// Dicoba satu per satu sampai ada yang cocok
const BLE_CONFIGS = [
  // Generic / Zjiang / Xprinter / banyak printer China
  { service: '000018f0-0000-1000-8000-00805f9b34fb', write: '00002af1-0000-1000-8000-00805f9b34fb' },
  // Nordic UART Service — dipakai banyak printer BLE modern
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
  // Peripage / Phomemo
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  // ISSC / Microchip
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', write: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
]

export function isMockMode(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem('printer_mock') === 'true'
}

export function isConnected(): boolean {
  return isMockMode() || (!!_device?.gatt?.connected && !!_char)
}

export function getDeviceName(): string | null {
  if (isMockMode()) return 'Mock Printer (Test)'
  return _device?.name ?? null
}

export function onDisconnect(cb: () => void) {
  _disconnectCb = cb
}

export async function connectPrinter(): Promise<string> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth tidak didukung di browser ini. Gunakan Chrome Android.')
  }

  const device = await (navigator as Navigator & { bluetooth: { requestDevice: (o: object) => Promise<BluetoothDevice> } })
    .bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_CONFIGS.map(c => c.service),
    })

  const server = await device.gatt!.connect()

  let found: BluetoothRemoteGATTCharacteristic | null = null
  for (const cfg of BLE_CONFIGS) {
    try {
      const svc = await server.getPrimaryService(cfg.service)
      found = await svc.getCharacteristic(cfg.write)
      break
    } catch {
      // coba config berikutnya
    }
  }

  if (!found) {
    device.gatt?.disconnect()
    throw new Error('Printer tidak dikenali. Pastikan printer BLE Anda sudah dinyalakan dan dekat.')
  }

  _device = device
  _char = found

  device.addEventListener('gattserverdisconnected', () => {
    _device = null
    _char = null
    _disconnectCb?.()
  })

  return device.name ?? 'Printer BLE'
}

export function disconnectPrinter() {
  _device?.gatt?.disconnect()
  _device = null
  _char = null
}

// Kirim data ke printer dalam chunk (BLE MTU ~100 bytes per write)
export async function sendRaw(data: Uint8Array): Promise<void> {
  if (!_char) throw new Error('Printer belum terhubung')
  const CHUNK = 100
  for (let i = 0; i < data.length; i += CHUNK) {
    await _char.writeValue(data.slice(i, i + CHUNK))
    // Jeda kecil agar buffer printer tidak overflow
    await new Promise(r => setTimeout(r, 20))
  }
}

// Konversi teks struk menjadi perintah ESC/POS
export function toEscPos(text: string): Uint8Array {
  const bytes: number[] = []

  // Inisialisasi printer
  bytes.push(0x1B, 0x40)
  // Code page PC437 (Western European / ASCII)
  bytes.push(0x1B, 0x74, 0x00)
  // Bold OFF
  bytes.push(0x1B, 0x45, 0x00)

  // Encode teks — ganti karakter non-ASCII & emoji dengan padanan
  const clean = text
    .replace(/😊/g, ':)')
    .replace(/[^\x00-\x7F]/g, '?')

  const encoder = new TextEncoder()
  for (const ch of clean) {
    if (ch === '\n') {
      bytes.push(0x0A)
    } else {
      encoder.encode(ch).forEach(b => bytes.push(b))
    }
  }

  // Feed 4 baris lalu potong kertas
  bytes.push(0x0A, 0x0A, 0x0A, 0x0A)
  bytes.push(0x1D, 0x56, 0x42, 0x00) // GS V B 0 — full cut

  return new Uint8Array(bytes)
}

// Helper utama: print teks struk via BLE (atau mock)
export async function printReceipt(receiptText: string): Promise<void> {
  if (isMockMode()) {
    // Simulasi delay pengiriman ke printer
    await new Promise(r => setTimeout(r, 500))
    console.log('[MOCK PRINT]\n' + receiptText)
    return
  }
  const data = toEscPos(receiptText)
  await sendRaw(data)
}
