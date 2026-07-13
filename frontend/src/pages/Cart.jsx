import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingCart, Minus, Plus, Trash2, Tag, Star, ArrowLeft, Gift, CreditCard, MapPin, Truck, Zap, Check } from 'lucide-react'
import { useCart } from '../hooks/useCart'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import Modal from '../components/Modal'
import AddressForm, { formatAddress } from '../components/AddressForm'

const POINTS_RATE = 0.05  // mirror backend POINTS_EARN_RATE

export default function Cart() {
  const navigate = useNavigate()
  const { items, setQty, removeItem, clear, subtotal, subtotalOriginal, requiresShipping } = useCart()
  const { user, refreshUser } = useAuth()

  const [coupon, setCoupon] = useState('')
  const [couponResult, setCouponResult] = useState(null)
  const [usePoints, setUsePoints] = useState(false)
  const [useCredit, setUseCredit] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [modal, setModal] = useState({ open: false })

  // Shipping address (only needed when the cart has physical goods)
  const [addresses, setAddresses] = useState([])
  const [addrId, setAddrId] = useState(null)
  const [addingAddr, setAddingAddr] = useState(false)
  const [savingAddr, setSavingAddr] = useState(false)

  const loadAddresses = () => {
    api.addresses().then(({ ok, data }) => {
      if (!ok) return
      const list = data.results || []
      setAddresses(list)
      setAddrId(prev => prev || (list.find(a => a.is_default) || list[0])?.id || null)
    })
  }

  useEffect(() => {
    if (user && requiresShipping) loadAddresses()
  }, [user, requiresShipping])

  const saveNewAddress = async (form) => {
    setSavingAddr(true)
    const { ok, data } = await api.addAddress(form)
    setSavingAddr(false)
    if (ok && data.status) {
      setAddingAddr(false)
      setAddrId(data.address.id)
      loadAddresses()
    } else {
      setModal({ open: true, type: 'error', title: 'บันทึกที่อยู่ไม่สำเร็จ', message: data.message || 'เกิดข้อผิดพลาด' })
    }
  }

  const availablePoints = parseFloat(user?.reward || 0)
  const availableCredit = parseFloat(user?.credit || 0)

  const flashSavings = Math.max(0, subtotalOriginal - subtotal)
  const couponPct = couponResult?.ok ? couponResult.discount : 0
  const couponDiscount = +(subtotal * couponPct / 100).toFixed(2)
  const afterCoupon = Math.max(0, subtotal - couponDiscount)
  const pointsValue = usePoints ? +Math.min(availablePoints, afterCoupon).toFixed(2) : 0
  const afterPoints = Math.max(0, afterCoupon - pointsValue)
  const creditValue = useCredit ? +Math.min(availableCredit, afterPoints).toFixed(2) : 0
  const total = +Math.max(0, afterPoints - creditValue).toFixed(2)
  const pointsEarned = +(total * POINTS_RATE).toFixed(2)

  const checkCoupon = async () => {
    if (!coupon.trim()) return
    const { ok, data } = await api.checkCoupon(coupon.trim())
    if (ok && data.status && data.discount != null) {
      setCouponResult({ ok: true, discount: parseFloat(data.discount), msg: `ใช้คูปองได้ • ลด ${data.discount}%` })
    } else {
      setCouponResult({ ok: false, discount: 0, msg: data.msg || data.message || 'คูปองไม่ถูกต้อง' })
    }
  }

  const placeOrder = async () => {
    if (!user) { navigate('/login'); return }
    if (items.length === 0) return
    if (requiresShipping && !addrId) {
      setModal({ open: true, type: 'error', title: 'ยังไม่ได้เลือกที่อยู่', message: 'คำสั่งซื้อนี้มีสินค้าที่ต้องจัดส่ง กรุณาเลือกที่อยู่จัดส่งก่อน' })
      return
    }
    setPlacing(true)
    const { ok, data } = await api.createCheckoutSession({
      items: items.map(i => ({ product_id: i.id, qty: i.qty })),
      coupon_code: couponResult?.ok ? coupon.trim() : undefined,
      points: pointsValue,
      credit: creditValue,
      address_id: requiresShipping ? addrId : undefined,
    })
    // Redirect to Stripe hosted checkout when a card payment is due
    if (ok && data.url) { window.location.href = data.url; return }
    setPlacing(false)
    if (ok && data.status && data.paid) {
      // Fully covered by points + store credit — order already completed
      await refreshUser()
      clear()
      setModal({
        open: true, type: 'success', title: 'สั่งซื้อสำเร็จ! 🎉',
        message: `ชำระด้วยแต้ม/เครดิตครบถ้วน${data.summary?.points_earned ? ` • ได้รับ ${data.summary.points_earned} แต้ม` : ''}`,
        action: { label: 'ติดตามคำสั่งซื้อ', onClick: () => navigate('/purchase-logs') },
      })
    } else {
      setModal({ open: true, type: 'error', title: 'สั่งซื้อไม่สำเร็จ', message: data.msg || data.message || data.error || 'เกิดข้อผิดพลาด' })
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 w-full text-center">
        <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
        <h1 className="text-2xl font-black text-slate-900 mb-2">ตะกร้าว่างเปล่า</h1>
        <p className="text-slate-500 mb-6">ยังไม่มีสินค้าในตะกร้าของคุณ</p>
        <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white font-bold rounded-full hover:bg-gray-800 transition-colors">
          เลือกซื้อสินค้า
        </Link>
        <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} action={modal.action} onClose={() => setModal({ open: false })} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">
      <button onClick={() => navigate('/products')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
        <ArrowLeft size={16} /> เลือกซื้อต่อ
      </button>

      <h1 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-3">
        <ShoppingCart size={28} /> ตะกร้าสินค้า <span className="text-lg text-slate-400 font-bold">({items.length})</span>
      </h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">

        {/* Items */}
        <div className="space-y-3">
          {items.map((it, i) => {
            const onSale = it.on_sale && it.original_price > it.price
            return (
              <motion.div key={it.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4">
                <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0">
                  <img src={it.image} alt={it.name} className="w-full h-full object-contain p-1.5" onError={e => { e.target.style.display = 'none' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{it.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`font-bold text-sm ${onSale ? 'text-red-500' : 'text-slate-900'}`}>{it.price} ฿</span>
                    {onSale && <span className="text-xs text-gray-400 line-through">{it.original_price} ฿</span>}
                    {it.delivery_type === 'physical' ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        <Truck size={10} /> จัดส่งพัสดุ
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full">
                        <Zap size={10} /> ส่งออนไลน์
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setQty(it.id, it.qty - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors"><Minus size={13} /></button>
                  <span className="w-7 text-center font-bold text-sm">{it.qty}</span>
                  <button onClick={() => setQty(it.id, it.qty + 1)} disabled={it.qty >= (it.stock ?? 99)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition-colors"><Plus size={13} /></button>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="font-black text-slate-900 text-sm">{(it.price * it.qty).toFixed(0)} ฿</p>
                  <button onClick={() => removeItem(it.id)} className="text-gray-300 hover:text-red-500 transition-colors mt-1"><Trash2 size={15} /></button>
                </div>
              </motion.div>
            )
          })}

          {/* Delivery */}
          {requiresShipping ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 font-black text-slate-900 text-sm">
                  <MapPin size={16} className="text-amber-500" /> ที่อยู่จัดส่ง
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded-full">จำเป็น</span>
                </h3>
                {!addingAddr && user && (
                  <button onClick={() => setAddingAddr(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-500 hover:text-amber-600 transition-colors">
                    <Plus size={13} /> เพิ่มที่อยู่ใหม่
                  </button>
                )}
              </div>

              {!user ? (
                <p className="text-sm text-slate-400">เข้าสู่ระบบเพื่อเลือกที่อยู่จัดส่ง</p>
              ) : addingAddr ? (
                <AddressForm onSave={saveNewAddress} onCancel={() => setAddingAddr(false)} saving={savingAddr} />
              ) : addresses.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-slate-400 mb-2">ยังไม่มีที่อยู่จัดส่ง</p>
                  <button onClick={() => setAddingAddr(true)} className="text-sm font-semibold text-amber-500 hover:text-amber-600">
                    + เพิ่มที่อยู่จัดส่ง
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {addresses.map(a => {
                    const selected = a.id === addrId
                    return (
                      <button key={a.id} onClick={() => setAddrId(a.id)}
                        className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                          selected ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                          selected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                        }`}>
                          {selected && <Check size={10} className="text-white" strokeWidth={4} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{a.recipient}</span>
                            {a.label && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{a.label}</span>}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{formatAddress(a)}</p>
                          {a.phone && <p className="text-[11px] text-slate-400 mt-0.5">โทร. {a.phone}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-sky-50 border border-sky-100 rounded-2xl p-4 mt-4">
              <Zap size={18} className="text-sky-500 shrink-0" />
              <p className="text-sm text-sky-700">
                <span className="font-bold">จัดส่งออนไลน์</span> — สินค้าทั้งหมดเป็นแบบดิจิทัล ระบบจะส่งคีย์/รหัสให้ทันทีหลังชำระเงิน ไม่ต้องระบุที่อยู่
              </p>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
          <h2 className="font-black text-lg text-slate-900">สรุปคำสั่งซื้อ</h2>

          {/* Coupon */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">คูปองส่วนลด</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={coupon} onChange={e => { setCoupon(e.target.value); setCouponResult(null) }}
                  placeholder="รหัสคูปอง"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 text-sm" />
              </div>
              <button onClick={checkCoupon} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold transition-colors">ใช้</button>
            </div>
            {couponResult && <p className={`mt-1.5 text-xs font-medium ${couponResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>{couponResult.msg}</p>}
          </div>

          {/* Points */}
          {availablePoints > 0 && (
            <label className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer">
              <input type="checkbox" checked={usePoints} onChange={e => setUsePoints(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              <Star size={16} className="fill-emerald-500 text-emerald-500" />
              <span className="text-sm text-emerald-700 font-medium flex-1">ใช้แต้มสะสม {availablePoints.toFixed(2)} แต้ม</span>
            </label>
          )}

          {/* Store credit */}
          {availableCredit > 0 && (
            <label className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-xl cursor-pointer">
              <input type="checkbox" checked={useCredit} onChange={e => setUseCredit(e.target.checked)} className="w-4 h-4 accent-violet-600" />
              <Gift size={16} className="text-violet-500" />
              <span className="text-sm text-violet-700 font-medium flex-1">ใช้ Store Credit {availableCredit.toFixed(2)} ฿</span>
            </label>
          )}

          {/* Breakdown */}
          <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
            <Row label="ยอดสินค้า" value={`${subtotalOriginal.toFixed(2)} ฿`} />
            {flashSavings > 0 && <Row label="ส่วนลด Flash Sale" value={`-${flashSavings.toFixed(2)} ฿`} red />}
            {couponDiscount > 0 && <Row label="ส่วนลดคูปอง" value={`-${couponDiscount.toFixed(2)} ฿`} red />}
            {pointsValue > 0 && <Row label="ใช้แต้มสะสม" value={`-${pointsValue.toFixed(2)} ฿`} red />}
            {creditValue > 0 && <Row label="ใช้ Store Credit" value={`-${creditValue.toFixed(2)} ฿`} red />}
            <div className="flex justify-between items-baseline border-t border-slate-100 pt-3">
              <span className="font-black text-slate-900">ยอดชำระ{total > 0 ? ' (บัตร/พร้อมเพย์)' : ''}</span>
              <span className="font-black text-2xl text-amber-500">{total.toFixed(2)} ฿</span>
            </div>
            {pointsEarned > 0 && (
              <p className="text-xs text-emerald-600 flex items-center gap-1.5 justify-end"><Star size={12} className="fill-emerald-500 text-emerald-500" /> จะได้รับ {pointsEarned} แต้ม</p>
            )}
          </div>

          <button onClick={placeOrder} disabled={placing}
            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-500/20">
            {placing ? 'กำลังดำเนินการ...' : !user ? 'เข้าสู่ระบบเพื่อสั่งซื้อ' : total > 0 ? <><CreditCard size={18} /> ชำระเงินผ่าน Stripe</> : 'ยืนยันคำสั่งซื้อ'}
          </button>
          {total > 0 && user && (
            <p className="text-[11px] text-slate-400 text-center">ชำระปลอดภัยผ่าน Stripe · รองรับบัตรเครดิต/เดบิต & พร้อมเพย์</p>
          )}
        </div>
      </div>

      <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} action={modal.action} onClose={() => setModal({ open: false })} />
    </div>
  )
}

function Row({ label, value, red }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${red ? 'text-red-500' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}
