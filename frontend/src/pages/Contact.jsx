import { motion } from 'framer-motion'
import { MessageCircle, Send, Camera, Users } from 'lucide-react'

const channels = [
  { icon: Users,         label: 'Facebook',   desc: 'ติดตามเราบน Facebook',  href: 'https://www.facebook.com/b.3xngn', color: 'bg-blue-500' },
  { icon: MessageCircle, label: 'LINE',        desc: 'แชทผ่าน LINE Official', href: '#', color: 'bg-green-500' },
  { icon: Camera,        label: 'Instagram',  desc: 'ดูสินค้าใหม่บน IG',     href: 'https://www.instagram.com/b.3xngn_', color: 'bg-pink-500' },
  { icon: Send,          label: 'Discord',    desc: 'ชุมชนลูกค้าของเรา',     href: 'https://discord.gg/B8qyMgnSAc', color: 'bg-indigo-500' },
]

export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-slate-900 mb-3">ติดต่อเรา</h1>
          <p className="text-slate-500">มีคำถาม? ทีมงานพร้อมช่วยเหลือคุณผ่านช่องทางเหล่านี้</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {channels.map(({ icon: Icon, label, desc, href, color }, i) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-50 transition-all duration-300"
            >
              <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                <Icon size={22} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800 group-hover:text-amber-600 transition-colors">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            </motion.a>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
