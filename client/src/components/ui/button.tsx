import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useSoundEffects } from "@/hooks/useSoundEffects"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Duolingo Primary (Green)
        duoPrimary: "bg-gradient-to-b from-duo-green-500 to-duo-green-600 text-white shadow-duo-button hover:from-duo-green-600 hover:to-duo-green-700 hover:shadow-glow-green active:translate-y-1 active:shadow-none focus-visible:ring-duo-green-400",
        
        // Duolingo Blue
        duoBlue: "bg-gradient-to-b from-duo-blue-500 to-duo-blue-600 text-white shadow-duo-button-blue hover:from-duo-blue-600 hover:to-duo-blue-700 hover:shadow-glow-blue active:translate-y-1 active:shadow-none focus-visible:ring-duo-blue-400",
        
        // Duolingo Orange
        duoOrange: "bg-gradient-to-b from-duo-orange-500 to-duo-orange-600 text-white shadow-duo-button-orange hover:from-duo-orange-600 hover:to-duo-orange-700 hover:shadow-glow-orange active:translate-y-1 active:shadow-none focus-visible:ring-duo-orange-400",
        
        // Default (Duolingo style as default)
        default: "bg-gradient-to-b from-duo-green-500 to-duo-green-600 text-white shadow-duo-button hover:from-duo-green-600 hover:to-duo-green-700 hover:shadow-glow-green active:translate-y-1 active:shadow-none",
        
        // Destructive (Red)
        destructive: "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_4px_0_0_#dc2626] hover:from-red-600 hover:to-red-700 hover:shadow-glow-red active:translate-y-1 active:shadow-none",
        
        // Outline (White with border)
        outline: "border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:shadow-md active:scale-95 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700",
        
        // Secondary (Gray)
        secondary: "bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700 border-2 border-gray-300 hover:from-gray-200 hover:to-gray-300 active:translate-y-1 dark:from-gray-700 dark:to-gray-800 dark:text-gray-200 dark:border-gray-600",
        
        // Ghost (Transparent)
        ghost: "text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-800",
        
        // Link style
        link: "text-duo-blue-600 underline-offset-4 hover:underline dark:text-duo-blue-400",
      },
      size: {
        default: "h-11 px-6 py-3 text-base",
        sm: "h-9 px-4 py-2 text-sm rounded-xl",
        lg: "h-14 px-8 py-4 text-lg",
        xl: "h-16 px-10 py-5 text-xl",
        icon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "duoPrimary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const sounds = useSoundEffects()
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      sounds.playClick()
      onClick?.(e)
    }
    
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={asChild ? onClick : handleClick}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
