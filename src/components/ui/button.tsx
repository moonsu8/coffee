import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// 모든 크기가 터치 영역 44px 이상
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-caramel text-on-caramel hover:brightness-105',
        dark: 'bg-espresso text-hero-ink hover:brightness-125',
        soft: 'bg-surface-2 text-ink hover:brightness-95',
        outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2',
        danger: 'bg-danger/12 text-danger hover:bg-danger/20',
      },
      size: {
        md: 'min-h-12 rounded-2xl px-5 text-[15px]',
        lg: 'min-h-14 rounded-[20px] px-6 text-[17px]',
        sm: 'min-h-11 rounded-xl px-4 text-sm',
        icon: 'size-11 rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

interface Props extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
