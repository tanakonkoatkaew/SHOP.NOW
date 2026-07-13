import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import { DiscordButton, GoogleButton, FacebookButton } from '../components/SocialButtons'

export default function Register() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-[#F2F0F1] py-14">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-black rounded-2xl items-center justify-center mb-4">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">สร้างบัญชีใหม่</h1>
          <p className="text-gray-500 mt-1.5 text-sm">สมัครง่ายๆ ผ่านบัญชีที่คุณมีอยู่แล้ว</p>
        </div>

        <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
          <div className="space-y-3">
            <DiscordButton label="สมัครด้วย Discord" onClick={() => window.location.href = '/api/auth/discord'} />
            <GoogleButton label="สมัครด้วย Google" onClick={() => window.location.href = '/api/auth/google'} />
            <FacebookButton label="สมัครด้วย Facebook" onClick={() => window.location.href = '/api/auth/facebook'} />
          </div>

          <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
            การสมัครถือว่าคุณยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัวของเรา
          </p>

          <p className="text-center text-sm text-gray-500 mt-4 pt-5 border-t border-gray-200">
            มีบัญชีแล้ว?{' '}
            <Link to="/login" className="text-black font-bold underline underline-offset-2 hover:text-gray-600 transition-colors">
              เข้าสู่ระบบ →
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
