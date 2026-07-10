import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingCart, CreditCard, Package, Clock, CheckCircle, XCircle, Truck, Box, Check } from 'lucide-react'
import { api } from '../services/api'
import Spinner from '../components/Spinner'

function StatusBadge({ status, refund }) {
  if (refund) return <span className="text-xs font-semibold px-2.5 py-1 bg-orange-50 text-orange-600 rounded-full">คืนเงิน</span>
  if (status === 'success' || status === true || status == null)
    return <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full flex items-center gap-1 w-fit"><CheckCircle size={11} />สำเร็จ</span>
  if (status === 'pending')
    return <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full flex items-center gap-1 w-fit"><Clock size={11} />รอดำเนินการ</span>
  return <span className="text-xs font-semibold px-2.5 py-1 bg-red-50 text-red-500 rounded-full flex items-center gap-1 w-fit"><XCircle size={11} />{status}</span>
}

const STEPS = [
  { key: 'pending',    label: 'รอดำเนินการ', icon: Clock },
  { key: 'processing', label: 'กำลังจัดส่ง',  icon: Box },
  { key: 'shipped',    label: 'จัดส่งแล้ว',   icon: Truck },
  { key: 'completed',  label: 'สำเร็จ',       icon: Check },
]

function OrderTimeline({ status }) {
  if (status === 'refunded' || status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-sm font-semibold text-red-500 mt-3">
        <XCircle size={16} /> {status === 'refunded' ? 'คืนเงินแล้ว' : 'ยกเลิกคำสั่งซื้อ'}
      </div>
    )
  }
  const current = Math.max(0, STEPS.findIndex(s => s.key === status))
  return (
    <div className="flex items-center mt-4">
      {STEPS.map((s, i) => {
        const done = i <= current
        const Icon = s.icon
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${done ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Icon size={15} />
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${done ? 'text-amber-600' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 -mt-4 ${i < current ? 'bg-amber-500' : 'bg-slate-100'}`} />}
          </div>
        )
      })}
    </div>
  )
}

export function PurchaseLogs() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    api.myOrders().then(({ ok, data }) => {
      if (ok && data.results) setOrders(data.results)
      setLoading(false)
    })
  }, [navigate])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <ShoppingCart size={18} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900">ติดตามคำสั่งซื้อ</h1>
          <p className="text-slate-500 text-xs">{orders.length} คำสั่งซื้อ</p>
        </div>
      </div>

      {loading ? <Spinner /> : orders.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">ยังไม่มีคำสั่งซื้อ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order, i) => (
            <motion.div key={order.receipt_id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-amber-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] font-mono text-slate-400">#{String(order.receipt_id).slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-slate-400">{order.dt_purchased}</p>
                </div>
                <p className="font-black text-amber-600">{order.total.toFixed(2)} ฿</p>
              </div>

              <div className="space-y-2">
                {order.items.map((it, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                      <img src={it.image} alt="" className="w-full h-full object-contain p-1" onError={e => { e.target.style.display = 'none' }} />
                    </div>
                    <p className="flex-1 min-w-0 text-sm text-slate-700 truncate">{it.name}</p>
                    <span className="text-xs text-slate-400 shrink-0">x{it.quantity}</span>
                  </div>
                ))}
              </div>

              <OrderTimeline status={order.refund ? 'refunded' : order.status} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopupLogs() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    api.topupLogs().then(({ ok, data }) => {
      if (ok && data.results) setLogs(data.results)
      setLoading(false)
    })
  }, [navigate])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <CreditCard size={18} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900">ประวัติการเติมเงิน</h1>
          <p className="text-slate-500 text-xs">{logs.length} รายการ</p>
        </div>
      </div>

      {loading ? <Spinner /> : logs.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <CreditCard size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">ยังไม่มีประวัติเติมเงิน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-amber-200 transition-colors"
            >
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <CreditCard size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">+{log.amount} บาท</p>
                <p className="text-xs text-slate-400 mt-0.5">{log.created_at}</p>
              </div>
              <StatusBadge status={log.status} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
