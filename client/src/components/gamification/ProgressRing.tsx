import { motion } from 'framer-motion'

interface ProgressRingProps {
  progress: number
  size?: number
  strokeWidth?: number
  color?: string
  showLabel?: boolean
  label?: string
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  color = '#58CC02',
  showLabel = true,
  label,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
          className="dark:stroke-gray-700"
        />

        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeInOut' }}
        />
      </svg>

      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-700 dark:text-gray-200">
            {Math.round(progress)}%
          </span>
          {label && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          )}
        </div>
      )}
    </div>
  )
}
