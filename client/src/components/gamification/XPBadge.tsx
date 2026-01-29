import { Star } from 'lucide-react'
import { motion } from 'framer-motion'

interface XPBadgeProps {
  xp: number
  animate?: boolean
}

export function XPBadge({ xp, animate = true }: XPBadgeProps) {
  return (
    <motion.div
      className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg"
      initial={animate ? { scale: 0 } : undefined}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1, rotate: 5 }}
      data-testid="xp-badge"
    >
      <Star className="w-5 h-5" fill="currentColor" />
      <span className="text-lg font-black">{xp} XP</span>
    </motion.div>
  )
}
