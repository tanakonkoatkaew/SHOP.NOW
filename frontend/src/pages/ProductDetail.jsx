import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Minus, Plus, ArrowLeft, ShoppingCart, Zap, Star, Check } from 'lucide-react'
import { api } from '../services/api'
import { useCart } from '../hooks/useCart'
import Spinner from '../components/Spinner'

const POINTS_RATE = 0.05  // mirror backend POINTS_EARN_RATE

function useCountdown(endIso) {
  const [left, setLeft] = useState(() => endIso ? Math.max(0, new Date(endIso) - Date.now()) : 0)
  useEffect(() => {
    if (!endIso) return
    const t = setInterval(() => setLeft(Math.max(0, new Date(endIso) - Date.now())), 1000)
    return () => clearInterval(t)
  }, [endIso])
  if (!endIso || left <= 0) return null
  const s = Math.floor(left / 1000)
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

export default function ProductDetail() {
  const { cate, id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    api.productDetail(cate, id).then(({ ok, data }) => {
      if (ok) setProduct(data.result || data.product || data)
      setLoading(false)
    })
  }, [cate, id])

  const countdown = useCountdown(product?.on_sale ? product?.sale_end : null)

  if (loading) return <Spinner />
  if (!product) return <div className="text-center py-32 text-slate-400">ไม่พบสินค้านี้</div>

  const onSale = product.on_sale && product.original_price > product.price
  const stock = product.stock ?? 0
  const outOfStock = stock <= 0
  const maxQty = Math.min(stock || 1, 10)
  const lineTotal = product.price * qty
  const pointsPreview = (lineTotal * POINTS_RATE).toFixed(2)

  const add = () => {
    addItem(product, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }
  const buyNow = () => {
    addItem(product, qty)
    navigate('/cart')
  }

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
          className="relative bg-slate-50 rounded-2xl overflow-hidden aspect-square flex items-center justify-center p-8"
        >
          {onSale && (
            <span className="absolute top-4 left-4 bg-red-500 text-white text-sm font-black px-3 py-1.5 rounded-full shadow z-10">
              -{Math.round((1 - product.price / product.original_price) * 100)}%
            </span>
          )}
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
                <ShieldCheck size={15} /> {product.warranty === true ? 'มีการรับประกัน' : product.warranty}
              </div>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className={`text-4xl font-black ${onSale ? 'text-red-500' : 'text-amber-500'}`}>{product.price} ฿</span>
            {onSale && <span className="text-slate-400 line-through text-lg">{product.original_price} ฿</span>}
          </div>

          {/* Flash sale countdown */}
          {onSale && countdown && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <Zap size={18} className="text-red-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide">Flash Sale จะจบใน</p>
                <div className="flex gap-1.5 mt-1 text-sm font-mono font-bold text-slate-800">
                  {countdown.d > 0 && <span>{countdown.d}วัน</span>}
                  <span>{String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '0')}:{String(countdown.s).padStart(2, '0')}</span>
                </div>
              </div>
            </div>
          )}

          {product.description && (
            <p className="text-sm text-slate-500 leading-relaxed">{product.description}</p>
          )}

          {/* Stock */}
          <p className="text-sm">
            {outOfStock
              ? <span className="text-red-500 font-bold">สินค้าหมดชั่วคราว</span>
              : <span className="text-slate-500">คงเหลือ <span className="font-bold text-slate-800">{stock}</span> ชิ้น</span>}
          </p>

          {/* Qty */}
          {!outOfStock && (
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">จำนวน</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors">
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold w-8 text-center">{qty}</span>
                <button onClick={() => setQty(q => Math.min(maxQty, q + 1))}
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Points preview */}
          {!outOfStock && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-xl px-4 py-2.5">
              <Star size={15} className="fill-emerald-500 text-emerald-500" />
              ซื้อชิ้นนี้รับ <span className="font-bold">{pointsPreview} แต้ม</span> สะสมไว้เป็นส่วนลดครั้งหน้า
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 space-y-3">
            <p className="text-sm text-slate-500">
              ยอดรวม: <span className="font-bold text-amber-500 text-lg">{lineTotal.toFixed(2)} ฿</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={add}
                disabled={outOfStock}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 border-2 border-slate-900 text-slate-900 font-bold rounded-xl hover:bg-slate-900 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-900 transition-all"
              >
                {added ? <><Check size={18} /> เพิ่มแล้ว</> : <><ShoppingCart size={18} /> ใส่ตะกร้า</>}
              </button>
              <button
                onClick={buyNow}
                disabled={outOfStock}
                className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                ซื้อทันที
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
