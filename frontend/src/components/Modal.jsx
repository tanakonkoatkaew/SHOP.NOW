import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, X } from 'lucide-react'

export default function Modal({ open, type = 'success', title, message, onClose, action }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center relative"
          >
            <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 transition-colors text-slate-400">
              <X size={18} />
            </button>

            {type === 'success'
              ? <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
              : <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            }

            <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
            <p className="text-slate-500 text-sm mb-6">{message}</p>

            {action && (
              <button
                onClick={action.onClick}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-all shadow-sm hover:shadow-amber-200 hover:shadow-lg"
              >
                {action.label}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
