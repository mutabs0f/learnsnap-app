import { motion } from 'framer-motion'

interface ProgressBarProps {
  progress: number
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error'
  showLabel?: boolean
  label?: string
  height?: 'small' | 'medium' | 'large'
  animated?: boolean
}

export function ProgressBar({
  progress,
  color = 'primary',
  showLabel = true,
  label,
  height = 'medium',
  animated = true,
}: ProgressBarProps) {
  const colors = {
    primary: 'bg-duo-green-500',
    secondary: 'bg-duo-blue-500',
    accent: 'bg-duo-orange-500',
    success: 'bg-duo-green-500',
    warning: 'bg-duo-yellow',
    error: 'bg-duo-red',
  }
  
  const heights = {
    small: 'h-2',
    medium: 'h-4',
    large: 'h-6',
  }
  
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div className="w-full" data-testid="progress-bar">
      {showLabel && (
        <div className="flex justify-between items-center mb-2 gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label || 'التقدم'}
          </span>
          <span className="text-sm font-black text-duo-green-600 dark:text-duo-green-400">
            {Math.round(clampedProgress)}%
          </span>
        </div>
      )}
      
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${heights[height]}`}>
        {animated ? (
          <motion.div
            className={`${colors[color]} ${heights[height]} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${clampedProgress}%` }}
            transition={{ 
              duration: 0.8, 
              ease: 'easeOut',
            }}
          />
        ) : (
          <div
            className={`${colors[color]} ${heights[height]} rounded-full transition-all duration-300`}
            style={{ width: `${clampedProgress}%` }}
          />
        )}
      </div>
    </div>
  )
}
