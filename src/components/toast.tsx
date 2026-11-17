import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  duration?: number
}
interface ToastItem extends ToastOptions {
  key: number
}

const Ctx = createContext<(t: ToastOptions) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setItem(null)
  }, [])

  const show = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current)
    const key = ++seq.current
    setItem({ ...t, key })
    timer.current = setTimeout(() => setItem((cur) => (cur?.key === key ? null : cur)), t.duration ?? 5000)
  }, [])

  return (
    <Ctx.Provider value={show}>
      {children}
      {/* 하단 탭바 위에 떠 있는 토스트. 앱 프레임 안에 고정 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        <div className="w-full max-w-[398px]" role="status" aria-live="polite">
          <AnimatePresence>
            {item && (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-2xl bg-espresso py-2 pr-2 pl-4 text-[#faf6f0] shadow-pop"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-caramel text-on-caramel">
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="flex-1 text-[15px] font-medium">{item.message}</span>
                {item.actionLabel && (
                  <button
                    onClick={() => {
                      item.onAction?.()
                      dismiss()
                    }}
                    className="min-h-11 rounded-xl px-4 text-[15px] font-bold text-[#f0b27a] hover:bg-white/10"
                  >
                    {item.actionLabel}
                  </button>
                )}
                <motion.span
                  className="absolute bottom-0 left-0 h-[3px] bg-caramel/80"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (item.duration ?? 5000) / 1000, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Ctx.Provider>
  )
}
