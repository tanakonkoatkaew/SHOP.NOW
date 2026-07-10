import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingCart, Minus, Plus, Trash2, Tag, Star, ArrowLeft, Wallet } from 'lucide-react'
import { useCart } from '../hooks/useCart'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import Modal from '../components/Modal'

const POINTS_RATE = 0.05  // mirror backend POINTS_EARN_RATE

export default function Cart() {
  const navigate = useNavigate()
  const { items, setQty, removeItem, clear, subtotal, subtotalOriginal } = useCart()
  const { user, refreshUser } = useAuth()

  const [coupon, setCoupon] = useState('')
  const [couponResult, setCouponResult] = useState(null)   // {ok, discount, msg}
  const [usePoints, setUsePoints] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [modal, setModal] = useState({ open: false })

  const availablePoints = parseFloat(user?.reward || 0)
  const credit = parseFloat(user?.credit || 0)

  const flashSavings = Math.max(0, subtotalOriginal - subtotal)
  const couponPct = couponResult?.ok ? couponResult.discount : 0
  const couponDiscount = +(subtotal * couponPct / 100).toFixed(2)
  const runningTotal = Math.max(0, subtotal - couponDiscount)
  const pointsValue = usePoints ? +Math.min(availablePoints, runningTotal).toFixed(2) : 0
  const total = +Math.max(0, runningTotal - pointsValue).toFixed(2)
  const pointsEarned = +(total * POINTS_RATE).toFixed(2)
  const notEnough = user && credit < total

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
    setPlacing(true)
    const { ok, data } = await api.checkout({
      items: items.map(i => ({ product_id: i.id, qty: i.qty })),
      coupon_code: couponResult?.ok ? coupon.trim() : undefined,
      points: pointsValue,
    })
    setPlacing(false)
    if (ok && data.status) {
      await refreshUser()
      clear()
      setModal({
        open: true, type: 'success', title: 'สั่งซื้อสำเร็จ! 🎉',
        message: `คำสั่งซื้อของคุณกำลังดำเนินการ${data.summary?.points_earned ? ` • ได้รับ ${data.summary.points_earned} แต้ม` : ''}`,
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
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`font-bold text-sm ${onSale ? 'text-red-500' : 'text-slate-900'}`}>{it.price} ฿</span>
                    {onSale && <span className="text-xs text-gray-400 line-through">{it.original_price} ฿</span>}
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

          {/* Breakdown */}
          <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
            <Row label="ยอดสินค้า" value={`${subtotalOriginal.toFixed(2)} ฿`} />
            {flashSavings > 0 && <Row label="ส่วนลด Flash Sale" value={`-${flashSavings.toFixed(2)} ฿`} red />}
            {couponDiscount > 0 && <Row label="ส่วนลดคูปอง" value={`-${couponDiscount.toFixed(2)} ฿`} red />}
            {pointsValue > 0 && <Row label="ใช้แต้มสะสม" value={`-${pointsValue.toFixed(2)} ฿`} red />}
            <div className="flex justify-between items-baseline border-t border-slate-100 pt-3">
              <span className="font-black text-slate-900">ยอดชำระ</span>
              <span className="font-black text-2xl text-amber-500">{total.toFixed(2)} ฿</span>
            </div>
            {pointsEarned > 0 && (
              <p className="text-xs text-emerald-600 flex items-center gap-1.5 justify-end"><Star size={12} className="fill-emerald-500 text-emerald-500" /> จะได้รับ {pointsEarned} แต้ม</p>
            )}
          </div>

          {/* Credit / checkout */}
          {user && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Wallet size={14} /> เครดิตคงเหลือ: <span className={`font-bold ${notEnough ? 'text-red-500' : 'text-slate-800'}`}>{credit.toFixed(2)} ฿</span>
            </div>
          )}
          {notEnough && (
            <Link to="/topup" className="block text-center text-sm font-semibold text-amber-600 hover:text-amber-700">เครดิตไม่พอ • เติมเงิน →</Link>
          )}

          <button onClick={placeOrder} disabled={placing || (user && notEnough)}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-500/20">
            {placing ? 'กำลังดำเนินการ...' : user ? 'ชำระเงิน' : 'เข้าสู่ระบบเพื่อสั่งซื้อ'}
          </button>
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
