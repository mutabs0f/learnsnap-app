import { Flame } from 'lucide-react'
import { motion } from 'framer-motion'

interface StreakCounterProps {
  days: number
  label?: string
}

export function StreakCounter({ days, label = 'يوم' }: StreakCounterProps) {
  return (
    <motion.div
      className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-2 rounded-full shadow-lg"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      data-testid="streak-counter"
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 10, -10, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      >
        <Flame className="w-6 h-6" fill="currentColor" />
      </motion.div>

      <div className="flex flex-col items-center">
        <span className="text-xl font-black leading-none">{days}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
    </motion.div>
  )
}
