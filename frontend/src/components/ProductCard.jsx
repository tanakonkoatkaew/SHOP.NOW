import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

function pseudoRating(str) {
  let h = 0
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return (3.5 + (Math.abs(h) % 16) / 10).toFixed(1)
}

function Stars({ rating }) {
  const r = parseFloat(rating)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width="14" height="14" viewBox="0 0 24 24" fill={n <= Math.round(r) ? '#FFC633' : '#e5e7eb'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      <span className="text-xs text-gray-500 ml-0.5">{rating}/5</span>
    </div>
  )
}

export default function ProductCard({ product, index = 0 }) {
  const rating = pseudoRating(product.id || product.name)
  const onSale = product.on_sale && product.original_price > product.price
  const off = onSale ? Math.round((1 - product.price / product.original_price) * 100) : 0
  const outOfStock = product.stock != null && product.stock <= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link
        to={`/product/${product.cate}/${product.id}`}
        className="group flex flex-col h-full"
      >
        {/* Image */}
        <div className="relative aspect-square bg-[#F2F0F1] rounded-2xl overflow-hidden mb-3">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-500"
            onError={e => { e.target.src = 'https://placehold.co/400x400/F2F0F1/999?text=No+Image' }}
          />
          {onSale && (
            <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-sm">
              -{off}%
            </span>
          )}
          <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm ${
            product.delivery_type === 'physical' ? 'bg-amber-500 text-white' : 'bg-sky-500 text-white'
          }`}>
            {product.delivery_type === 'physical' ? '🚚 พัสดุ' : '⚡ ออนไลน์'}
          </span>
          {outOfStock && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="bg-black text-white text-xs font-bold px-3 py-1.5 rounded-full">สินค้าหมด</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1.5 px-0.5">
          <h3 className="text-sm font-bold text-black leading-snug line-clamp-2 group-hover:underline">
            {product.name}
          </h3>
          <Stars rating={rating} />
          <div className="flex items-baseline gap-2">
            <p className={`text-base font-bold ${onSale ? 'text-red-500' : 'text-black'}`}>{product.price} ฿</p>
            {onSale && <p className="text-xs text-gray-400 line-through">{product.original_price} ฿</p>}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
