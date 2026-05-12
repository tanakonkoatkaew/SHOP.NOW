import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingCart, CreditCard, Package, Clock, CheckCircle, XCircle } from 'lucide-react'
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

export function PurchaseLogs() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    api.purchaseLogs().then(({ ok, data }) => {
      if (ok && data.results) setLogs(data.results)
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
          <h1 className="text-xl font-black text-slate-900">ประวัติคำสั่งซื้อ</h1>
          <p className="text-slate-500 text-xs">{logs.length} รายการ</p>
        </div>
      </div>

      {loading ? <Spinner /> : logs.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">ยังไม่มีคำสั่งซื้อ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((order, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-amber-200 transition-colors"
            >
              <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                <img src={order.product?.image} alt="" className="w-full h-full object-contain p-1.5"
                  onError={e => { e.target.style.display='none' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{order.product?.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{order.dt_purchased}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="font-bold text-amber-600 text-sm">{order.product?.price} ฿</p>
                <StatusBadge refund={order.refund} />
              </div>
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
