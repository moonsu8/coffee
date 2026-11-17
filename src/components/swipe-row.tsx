import { animate, motion, useMotionValue } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

const W = 132 // 액션 영역 너비 (버튼 2개 × 66)

interface Props {
  children: ReactNode
  onEdit: () => void
  onDelete: () => void
  label: string
}

/** 왼쪽으로 밀면 수정/삭제 노출. 탭하면 수정 */
export function SwipeRow({ children, onEdit, onDelete, label }: Props) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const dragged = useRef(false)

  const snap = (to: number) => {
    setOpen(to !== 0)
    animate(x, to, { type: 'spring', damping: 32, stiffness: 420 })
  }

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: W }} aria-hidden={!open}>
        <button
          tabIndex={open ? 0 : -1}
          onClick={() => {
            snap(0)
            onEdit()
          }}
          aria-label={`${label} 수정`}
          className="flex w-1/2 flex-col items-center justify-center gap-0.5 bg-caramel text-xs font-bold text-on-caramel"
        >
          <Pencil size={18} />
          수정
        </button>
        <button
          tabIndex={open ? 0 : -1}
          onClick={() => {
            snap(0)
            onDelete()
          }}
          aria-label={`${label} 삭제`}
          className="flex w-1/2 flex-col items-center justify-center gap-0.5 bg-[#a63a26] text-xs font-bold text-white"
        >
          <Trash2 size={18} />
          삭제
        </button>
      </div>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -W, right: 0 }}
        dragElastic={0.08}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          snap(info.offset.x < -W / 3 || info.velocity.x < -400 ? -W : 0)
          setTimeout(() => (dragged.current = false), 0)
        }}
        className="relative bg-surface"
      >
        <button
          onClick={() => {
            if (dragged.current) return
            if (open) snap(0)
            else onEdit()
          }}
          className="block w-full text-left"
        >
          {children}
        </button>
      </motion.div>
    </div>
  )
}
