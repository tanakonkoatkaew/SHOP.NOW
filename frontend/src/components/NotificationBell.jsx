import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck } from 'lucide-react'
import { api } from '../services/api'

const TYPE_DOT = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'เมื่อสักครู่'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`
  return `${Math.floor(diff / 86400)} วันที่แล้ว`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  const load = useCallback(async () => {
    const { ok, data } = await api.notifications()
    if (ok && data.status) {
      setItems(data.results || [])
      setUnread(data.unread || 0)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)   // poll every 30s
    return () => clearInterval(t)
  }, [load])

  // Close on outside click
  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) await load()
  }

  const markAll = async () => {
    await api.readNotification()
    setItems(items.map(i => ({ ...i, read: true })))
    setUnread(0)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative p-2 text-gray-500 hover:text-black transition-colors"
        aria-label="การแจ้งเตือน"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-black">การแจ้งเตือน</span>
              {unread > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-xs text-gray-500 hover:text-black transition-colors">
                  <CheckCheck size={13} /> อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</p>
              ) : (
                items.map(n => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${n.read ? '' : 'bg-amber-50/40'}`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[n.type] || TYPE_DOT.info}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
