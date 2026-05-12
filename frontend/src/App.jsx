import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import Topup from './pages/Topup'
import { PurchaseLogs, TopupLogs } from './pages/Logs'
import Contact from './pages/Contact'
import Admin from './pages/Admin'
import ChatWidget from './components/ChatWidget'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex flex-col min-h-screen bg-white">
          <Navbar />
          <main className="flex-1 flex flex-col">
            <Routes>
              <Route path="/"                  element={<Home />} />
              <Route path="/products"          element={<Products />} />
              <Route path="/product/:cate/:id" element={<ProductDetail />} />
              <Route path="/login"             element={<Login />} />
              <Route path="/register"          element={<Register />} />
              <Route path="/profile"           element={<Profile />} />
              <Route path="/topup"             element={<Topup />} />
              <Route path="/purchase-logs"     element={<PurchaseLogs />} />
              <Route path="/topup-logs"        element={<TopupLogs />} />
              <Route path="/contact"           element={<Contact />} />
              <Route path="/admin"            element={<Admin />} />
            </Routes>
          </main>
          <Footer />
          <ChatWidget />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
