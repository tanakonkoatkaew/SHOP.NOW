import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Wallet, User, LogOut, ChevronDown, Search, ShieldCheck, ShoppingCart, Star, Gift } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import NotificationBell from './NotificationBell'

const navLinks = [
  { to: '/products',              label: 'สินค้า' },
  { to: '/products?cat=fashion',  label: 'แฟชั่น' },
  { to: '/coupons',               label: 'คูปอง' },
  { to: '/topup',                 label: 'Store Credit' },
  { to: '/contact',               label: 'ติดต่อ' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [announce, setAnnounce] = useState(true)

  return (
    <header className="sticky top-0 z-50 bg-white">
      {/* Announcement bar */}
      {announce && !user && (
        <div className="bg-black text-white text-xs py-2.5 text-center relative">
          <span>สมัครสมาชิกวันนี้ รับส่วนลด 20% คำสั่งซื้อแรกทันที!</span>
          <Link to="/register" className="underline font-semibold ml-1">สมัครเลย →</Link>
          <button onClick={() => setAnnounce(false)} className="absolute right-4 top-1/2 -translate-y-1/2 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main nav */}
      <div className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-8">

          {/* Logo */}
          <Link to="/" className="font-black text-xl tracking-tight text-black uppercase shrink-0">
            Shop.Now
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(({ to, label }) => {
              // Links carry a query string (e.g. ?cat=fashion), so match on the full path
              const active = `${location.pathname}${location.search}` === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`text-sm font-medium transition-colors relative group ${active ? 'text-black' : 'text-gray-500 hover:text-black'}`}
                >
                  {label}
                  <span className={`absolute -bottom-0.5 left-0 h-0.5 bg-black transition-all duration-200 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </Link>
              )
            })}
          </nav>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <Link to="/products" className="p-2 text-gray-500 hover:text-black transition-colors">
              <Search size={20} />
            </Link>

            <Link to="/cart" className="relative p-2 text-gray-500 hover:text-black transition-colors">
              <ShoppingCart size={20} />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>

            {user && <NotificationBell />}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 hover:border-black transition-all text-sm font-medium"
                >
                  <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-bold">{user.username?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-gray-700">{user.username}</span>
                  <span className="font-semibold text-black">{parseFloat(user.credit || 0).toFixed(0)} ฿</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-[#F2F0F1] flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500"><Wallet size={13} /> Store Credit</span>
                        <span className="text-sm font-bold text-black">{parseFloat(user.credit || 0).toFixed(2)} ฿</span>
                      </div>
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500"><Star size={13} className="fill-amber-400 text-amber-400" /> แต้มสะสม</span>
                        <span className="text-sm font-bold text-emerald-600">{parseFloat(user.reward || 0).toFixed(2)}</span>
                      </div>
                      <Link to="/profile" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <User size={15} /> โปรไฟล์
                      </Link>
                      <Link to="/topup" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <Gift size={15} /> เติม Store Credit
                      </Link>
                    {user.is_admin && (
                      <Link to="/admin" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-black hover:bg-gray-50 transition-colors">
                        <ShieldCheck size={15} /> Admin Panel
                      </Link>
                    )}
                      <Link to="/purchase-logs" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        ติดตามคำสั่งซื้อ
                      </Link>
                      <div className="h-px bg-gray-100 mx-4" />
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false); window.location.href = '/' }}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 w-full transition-colors"
                      >
                        <LogOut size={15} /> ออกจากระบบ
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-black transition-colors">
                  เข้าสู่ระบบ
                </Link>
                <Link to="/register" className="px-5 py-2 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors">
                  สมัครฟรี
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden ml-auto p-2 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setOpen(v => !v)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-200 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setOpen(false)}
                  className="block px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                  {label}
                </Link>
              ))}
              <Link to="/cart" onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                <span className="flex items-center gap-2"><ShoppingCart size={16} /> ตะกร้าสินค้า</span>
                {count > 0 && <span className="min-w-[20px] h-5 px-1.5 bg-amber-500 text-white text-xs font-black rounded-full flex items-center justify-center">{count}</span>}
              </Link>
              {user ? (
                <div className="pt-3 border-t border-gray-100 space-y-1">
                  <p className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                    <span className="w-6 h-6 bg-black rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs font-bold">{user.username?.[0]?.toUpperCase()}</span>
                      )}
                    </span>
                    {user.username} · <span className="font-bold text-black">{parseFloat(user.credit || 0).toFixed(0)} ฿</span>
                  </p>
                  <Link to="/profile" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl">โปรไฟล์</Link>
                  <button onClick={() => { logout(); setOpen(false); window.location.href = '/' }} className="block w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl">ออกจากระบบ</button>
                </div>
              ) : (
                <div className="pt-3 border-t border-gray-100 flex gap-2">
                  <Link to="/login" onClick={() => setOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-full border border-gray-300 text-sm font-medium">เข้าสู่ระบบ</Link>
                  <Link to="/register" onClick={() => setOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-full bg-black text-white text-sm font-semibold">สมัครฟรี</Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
