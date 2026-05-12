import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Minus, Plus, Tag, ArrowLeft } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

export default function ProductDetail() {
  const { cate, id } = useParams()
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [coupon, setCoupon] = useState('')
  const [couponResult, setCouponResult] = useState(null)
  const [buying, setBuying] = useState(false)
  const [modal, setModal] = useState({ open: false })

  useEffect(() => {
    api.productDetail(cate, id).then(({ ok, data }) => {
      if (ok) setProduct(data.result || data.product || data)
      setLoading(false)
    })
  }, [cate, id])

  const checkCoupon = async () => {
    const { ok, data } = await api.checkCoupon(coupon)
    if (ok && data.discount != null) {
      setCouponResult({ ok: true, discount: parseFloat(data.discount), msg: `ส่วนลด ${data.discount}%` })
    } else {
      setCouponResult({ ok: false, discount: 0, msg: data.msg || data.message || 'คูปองไม่ถูกต้อง' })
    }
  }

  const buy = async () => {
    if (!user) { navigate('/login'); return }
    setBuying(true)
    const { ok, data } = await api.buyProduct(id, {
      category_id: cate,
      qty,
      coupon_code: coupon || undefined,
    })
    setBuying(false)
    if (ok && data.status) {
      await refreshUser()
      setModal({ open: true, type: 'success', title: 'สั่งซื้อสำเร็จ!', message: data.message || 'สินค้าถูกส่งให้คุณแล้ว', action: { label: 'ดูประวัติการซื้อ', onClick: () => navigate('/purchase-logs') } })
    } else {
      setModal({ open: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: data.message || data.error || 'ไม่สามารถสั่งซื้อได้' })
    }
  }

  if (loading) return <Spinner />
  if (!product) return <div className="text-center py-32 text-slate-400">ไม่พบสินค้านี้</div>

  const finalPrice = couponResult?.ok && couponResult.discount > 0
    ? (product.price * (1 - couponResult.discount / 100)).toFixed(2)
    : product.price

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">

      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
        <ArrowLeft size={16} /> กลับ
      </button>

      <div className="grid md:grid-cols-2 gap-12 items-start">

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-50 rounded-2xl overflow-hidden aspect-square flex items-center justify-center p-8"
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain"
            onError={e => { e.target.src = 'https://placehold.co/600x600?text=No+Image' }}
          />
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">{product.name}</h1>
            {product.warranty && (
              <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                <ShieldCheck size={15} /> {product.warranty}
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-black text-amber-500">{finalPrice} ฿</span>
            {couponResult?.ok && (
              <span className="text-slate-400 line-through text-lg">{product.price} ฿</span>
            )}
          </div>

          {/* Coupon */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">คูปองส่วนลด</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={coupon}
                  onChange={e => setCoupon(e.target.value)}
                  placeholder="กรอกรหัสคูปอง"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm"
                />
              </div>
              <button
                onClick={checkCoupon}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold transition-colors"
              >
                ตรวจสอบ
              </button>
            </div>
            {couponResult && (
              <p className={`mt-2 text-sm font-medium ${couponResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {couponResult.msg}
              </p>
            )}
          </div>

          {/* Qty */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">จำนวน</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="text-lg font-bold w-8 text-center">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(5, q + 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Buy */}
          <div className="pt-2">
            <p className="text-sm text-slate-500 mb-3">
              ยอดรวม: <span className="font-bold text-amber-500 text-lg">{(finalPrice * qty).toFixed ? (parseFloat(finalPrice) * qty).toFixed(2) : finalPrice} ฿</span>
            </p>
            <button
              onClick={buy}
              disabled={buying}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black text-lg rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 hover:scale-[1.01]"
            >
              {buying ? 'กำลังสั่งซื้อ...' : 'สั่งซื้อเลย'}
            </button>
          </div>
        </motion.div>
      </div>

      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        action={modal.action}
        onClose={() => setModal({ open: false })}
      />
    </div>
  )
}
