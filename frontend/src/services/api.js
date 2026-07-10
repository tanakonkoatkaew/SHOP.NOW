const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export const api = {
  get:    (path)       => request('GET',    path),
  post:   (path, body) => request('POST',   path, body),
  put:    (path, body) => request('PUT',    path, body),
  delete: (path)       => request('DELETE', path),

  // Auth
  login:         (body) => request('POST', '/auth/login',    body),
  register:      (body) => request('POST', '/auth/register', body),
  me:            ()     => request('GET',  '/auth/me/user'),
  profile:       ()     => request('GET',  '/auth/me/profile'),
  updateProfile: (body) => request('PUT',  '/auth/me/profile', body),

  // Notifications
  notifications:     ()   => request('GET',  '/auth/me/notifications'),
  readNotification:  (id) => request('POST', '/auth/me/notifications/read', id ? { id } : {}),

  // Products
  products:      ()         => request('GET', '/products/product'),
  publicStats:   ()         => request('GET', '/products/stats'),
  publicCoupons: ()         => request('GET', '/products/coupons'),
  productDetail: (cate, id) => request('GET', `/products/product/${cate}/${id}`),

  // Orders
  purchaseLogs: () => request('GET', '/products/me/logs/product/0/50'),
  myOrders:     () => request('GET', '/products/me/orders'),
  checkCoupon:  (code) => request('GET', `/products/checkCoupon/${code}`),

  // Payment (Stripe Checkout)
  createCheckoutSession: (body) => request('POST', '/payment/checkout-session', body),
  confirmPayment:        (session_id) => request('POST', '/payment/confirm', { session_id }),
  redeemCode:            (code) => request('POST', '/payment/redeem-code', { code }),

  // Admin
  admin: {
    stats:         ()        => request('GET',    '/admin/stats'),
    uploadProductImage: (file) => {
      const form = new FormData()
      form.append('image', file)
      return fetch(`${BASE}/admin/products/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      }).then(r => r.json())
    },
    products:      ()        => request('GET',    '/admin/products'),
    createProduct: (data)    => request('POST',   '/admin/products', data),
    updateProduct: (id, data)=> request('PUT',    `/admin/products/${id}`, data),
    deleteProduct: (id)      => request('DELETE', `/admin/products/${id}`),
    coupons:       ()        => request('GET',    '/admin/coupons'),
    createCoupon:  (data)    => request('POST',   '/admin/coupons', data),
    updateCoupon:  (id, data)=> request('PUT',    `/admin/coupons/${id}`, data),
    deleteCoupon:  (id)      => request('DELETE', `/admin/coupons/${id}`),
    users:         ()        => request('GET',    '/admin/users'),
    updateUser:    (id, data)=> request('PUT',    `/admin/users/${id}`, data),
    deleteUser:    (id)      => request('DELETE', `/admin/users/${id}`),
    userOrders:    (id)      => request('GET',    `/admin/users/${id}/orders`),
    orders:        (status)  => request('GET',    `/admin/orders${status && status !== 'all' ? `?status=${status}` : ''}`),
    updateOrderStatus: (rid, status) => request('POST', `/admin/orders/${rid}/status`, { status }),

    // Chat (admin side)
    chatSessions:       ()           => request('GET',    '/admin/chat/sessions'),
    chatMessages:       (sessionId)  => request('GET',    `/admin/chat/sessions/${sessionId}/messages`),
    chatReply:          (sessionId, text) => request('POST', `/admin/chat/sessions/${sessionId}/reply`, { text }),
    chatDelete:         (sessionId)  => request('DELETE', `/admin/chat/sessions/${sessionId}`),
  },

  // Chat (user side)
  chat: {
    faq:        ()       => request('GET',  '/chat/faq'),
    messages:   ()       => request('GET',  '/chat/messages'),
    send:       (text, opts = {}) => request('POST', '/chat/send', { text, ...opts }),
    faqAnswer:  (id)     => request('POST', '/chat/faq-answer', { id }),
  },
}
