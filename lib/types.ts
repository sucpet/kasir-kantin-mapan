export interface MenuOption {
  name: string
  choices: string[]
}

export interface MenuItem {
  id: string
  name: string
  price: number
  category: string
  available: boolean
  options: MenuOption[]
  image_url: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string | null
  name: string
  price: number
  qty: number
  note: string | null
}

export interface Order {
  id: string
  customer_name: string
  status: 'open' | 'paid'
  total: number
  paid_amount: number | null
  note: string | null
  created_at: string
  paid_at: string | null
  payment_method: string | null
  source: 'kasir' | 'customer'
  order_items?: OrderItem[]
}

export interface CartItem {
  menuId: string
  cartKey: string
  name: string
  price: number
  qty: number
  note: string
}
