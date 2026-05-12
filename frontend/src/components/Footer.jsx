import { Link } from 'react-router-dom'
import { MessageCircle, Send, Camera, Users } from 'lucide-react'

const cols = [
  { title: 'บริษัท', links: [{ to: '/products', label: 'สินค้า' }, { to: '/contact', label: 'เกี่ยวกับเรา' }, { to: '/contact', label: 'ติดต่อ' }] },
  { title: 'ช่วยเหลือ', links: [{ to: '/purchase-logs', label: 'ติดตามคำสั่งซื้อ' }, { to: '/topup', label: 'เติมเงิน' }, { to: '/topup-logs', label: 'ประวัติเติมเงิน' }] },
  { title: 'บัญชี', links: [{ to: '/login', label: 'เข้าสู่ระบบ' }, { to: '/register', label: 'สมัครสมาชิก' }, { to: '/profile', label: 'โปรไฟล์' }] },
]

export default function Footer() {
  const isLoggedIn = !!localStorage.getItem('token')

  return (
    <footer className="bg-black text-white mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand col */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="font-black text-2xl tracking-tight uppercase text-white">Shop.Now</Link>
            <p className="text-gray-400 text-sm mt-3 leading-relaxed">
              ร้านค้าสินค้าดิจิทัลคุณภาพสูง เกม ซอฟต์แวร์ และบัตรเติมเงิน ราคาดี บริการรวดเร็ว
            </p>
            <div className="flex gap-3 mt-5">
              {[MessageCircle, Send, Camera, Users].map((Icon, i) => (
                <a key={i} href="#" className="w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-colors">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Link cols */}
          {cols.filter(col => !(isLoggedIn && col.title === 'บัญชี')).map(col => (
            <div key={col.title}>
              <h3 className="font-bold text-sm uppercase tracking-widest mb-5">{col.title}</h3>
              <ul className="space-y-3">
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-gray-400 text-sm hover:text-white transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">© 2025 Shop.Now. All rights reserved.</p>
          <div className="flex gap-6 text-xs text-gray-600">
            <a href="#" className="hover:text-gray-400 transition-colors">นโยบายความเป็นส่วนตัว</a>
            <a href="#" className="hover:text-gray-400 transition-colors">เงื่อนไขการใช้งาน</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
