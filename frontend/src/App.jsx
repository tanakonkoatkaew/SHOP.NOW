import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { CartProvider } from './hooks/useCart'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import Topup from './pages/Topup'
import Cart from './pages/Cart'
import CheckoutSuccess from './pages/CheckoutSuccess'
import { PurchaseLogs } from './pages/Logs'
import Contact from './pages/Contact'
import Coupons from './pages/Coupons'
import Admin from './pages/Admin'
import ChatWidget from './components/ChatWidget'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <div className="flex flex-col min-h-screen bg-white">
            <Navbar />
            <main className="flex-1 flex flex-col">
              <Routes>
                <Route path="/"                  element={<Home />} />
                <Route path="/products"          element={<Products />} />
                <Route path="/product/:cate/:id" element={<ProductDetail />} />
                <Route path="/cart"              element={<Cart />} />
                <Route path="/checkout/success"  element={<CheckoutSuccess />} />
                <Route path="/login"             element={<Login />} />
                <Route path="/register"          element={<Register />} />
                <Route path="/profile"           element={<Profile />} />
                <Route path="/topup"             element={<Topup />} />
                <Route path="/purchase-logs"     element={<PurchaseLogs />} />
                <Route path="/contact"           element={<Contact />} />
                <Route path="/coupons"           element={<Coupons />} />
                <Route path="/admin"            element={<Admin />} />
              </Routes>
            </main>
            <Footer />
            <ChatWidget />
          </div>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
