import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 하단 고정 푸터 영역(시트가 제공). SheetFooter가 여기로 내용을 옮겨 그린다 */
const FooterContext = createContext<HTMLElement | null>(null)

/**
 * 시트의 하단 고정 영역에 버튼을 놓는다. 스크롤 영역 안의 폼(상태를 가진 컴포넌트)에서 그대로 쓸 수 있다.
 * 내용이 길어도 저장 같은 주요 버튼은 항상 화면 아래에 보인다.
 */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  const el = useContext(FooterContext)
  return el ? createPortal(<div className={className}>{children}</div>, el) : null
}

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

/**
 * 바텀시트 (shadcn Sheet 스타일, Radix Dialog + Framer Motion).
 *
 * 구조: 헤더(손잡이·제목) / 가운데 스크롤 영역 / 하단 고정 푸터 / 안전영역 여백
 * - 끌어서 닫기는 **손잡이에만** 걸린다(dragControls + dragListener={false}).
 *   컨테이너 전체에 drag="y"를 걸면 Framer Motion이 그 요소에 touch-action: pan-x를 걸어
 *   세로 스와이프로 내용을 스크롤할 수 없게 된다.
 * - 스크롤 영역: flex-1 + min-h-0 + overflow-y-auto + overscroll-contain + touch-action: pan-y
 */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  const controls = useDragControls()
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[#1c1410]/55 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center">
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="pointer-events-auto flex max-h-[calc(100dvh-16px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-pop outline-none"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 34, stiffness: 380 }}
                  drag="y"
                  dragControls={controls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false)
                  }}
                >
                  {/* 헤더: 손잡이(여기서만 끌어서 닫기) + 제목 */}
                  <div
                    data-sheet-handle
                    onPointerDown={(e) => controls.start(e)}
                    style={{ touchAction: 'none' }}
                    className="flex shrink-0 cursor-grab justify-center pt-3 pb-3 active:cursor-grabbing"
                  >
                    <div className="h-1.5 w-10 rounded-full bg-line" />
                  </div>
                  <div className="shrink-0 px-6 pb-2">
                    <Dialog.Title className="text-xl font-bold tracking-tight text-ink">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-1 text-sm text-ink-2">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>

                  {/* 스크롤 영역 */}
                  <div
                    className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-6 pt-2 pb-5"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    <FooterContext.Provider value={footerEl}>{children}</FooterContext.Provider>
                  </div>

                  {/* 하단 고정 푸터 (SheetFooter가 있을 때만 보인다) + 안전영역 여백 */}
                  <div ref={setFooterEl} className="shrink-0 border-t border-line bg-surface px-6 pt-3 pb-3 empty:hidden" />
                  <div aria-hidden className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
