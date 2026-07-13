import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'shopnow_cart'

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* quota */ }
  }, [items])

  // product: { id, name, image, price, original_price, on_sale, cate, stock }
  const addItem = useCallback((product, qty = 1) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === product.id)
      if (idx >= 0) {
        const next = [...prev]
        const cap = product.stock ?? next[idx].stock ?? 99
        next[idx] = { ...next[idx], qty: Math.min(cap, next[idx].qty + qty) }
        return next
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        image: product.image,
        price: Number(product.price) || 0,
        original_price: Number(product.original_price ?? product.price) || 0,
        on_sale: !!product.on_sale,
        cate: product.cate,
        stock: product.stock ?? 99,
        delivery_type: product.delivery_type || 'digital',
        qty: Math.max(1, qty),
      }]
    })
  }, [])

  const setQty = useCallback((id, qty) => {
    setItems(prev => prev.map(i => i.id === id
      ? { ...i, qty: Math.max(1, Math.min(i.stock ?? 99, qty)) }
      : i))
  }, [])

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((s, i) => s + i.qty, 0)
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const subtotalOriginal = items.reduce((s, i) => s + (i.original_price || i.price) * i.qty, 0)
  // Any physical item means the order has to be shipped
  const requiresShipping = items.some(i => i.delivery_type === 'physical')

  return (
    <CartContext.Provider value={{ items, addItem, setQty, removeItem, clear, count, subtotal, subtotalOriginal, requiresShipping }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
