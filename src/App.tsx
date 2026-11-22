import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { BarChart3, CalendarDays, Coffee, Settings, TreePalm, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ToastProvider } from '@/components/toast'
import { AbsencesScreen } from '@/screens/absences'
import { HistoryScreen } from '@/screens/history'
import { HomeScreen } from '@/screens/home'
import { SettingsScreen } from '@/screens/settings'
import { StatsScreen } from '@/screens/stats'
import { applyTheme } from '@/lib/theme'
import { SharedBanner } from '@/components/shared-banner'
import { RemoteProvider } from '@/remote/provider'
import { StoreProvider, useStore } from '@/store/store'
import { cn } from '@/lib/utils'

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '홈', icon: Coffee },
  { id: 'history', label: '기록', icon: CalendarDays },
  { id: 'absences', label: '휴가', icon: TreePalm },
  { id: 'stats', label: '통계', icon: BarChart3 },
  { id: 'settings', label: '설정', icon: Settings },
]

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 36 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -36 }),
}

/** 현재 그룹의 테마를 앱 최상위(data-theme)와 meta theme-color에 반영한다 */
function ThemeSync() {
  const { data } = useStore()
  const first = useRef(true)
  useLayoutEffect(() => {
    applyTheme(data.config.themeId, !first.current)
    first.current = false
  }, [data.config.themeId])
  return null
}

export default function App() {
  const [tab, setTab] = useState(0)
  const [dir, setDir] = useState(1)
  const scroller = useRef<HTMLElement>(null)

  const go = (i: number) => {
    if (i === tab) return
    setDir(i > tab ? 1 : -1)
    setTab(i)
    scroller.current?.scrollTo({ top: 0 })
  }

  return (
    <MotionConfig reducedMotion="user">
      <RemoteProvider>
      <StoreProvider>
        <ThemeSync />
        {/* 모바일은 전체 화면, 데스크탑은 가운데 정렬된 카드형 프레임 */}
        <div className="md:flex md:h-full md:items-center md:justify-center">
          <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg md:h-[min(880px,calc(100dvh-48px))] md:rounded-[36px] md:border md:border-line md:shadow-pop">
            <ToastProvider>
              <SharedBanner />
              <main ref={scroller} className="scroll-clean flex-1 overflow-x-hidden overflow-y-auto">
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={TABS[tab].id}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {tab === 0 && <HomeScreen goSettings={() => go(4)} />}
                    {tab === 1 && <HistoryScreen />}
                    {tab === 2 && <AbsencesScreen />}
                    {tab === 3 && <StatsScreen />}
                    {tab === 4 && <SettingsScreen />}
                  </motion.div>
                </AnimatePresence>
              </main>

              <nav
                aria-label="메인 메뉴"
                className="z-30 shrink-0 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
              >
                <ul className="grid grid-cols-5">
                  {TABS.map((t, i) => {
                    const active = i === tab
                    const Icon = t.icon
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => go(i)}
                          aria-current={active ? 'page' : undefined}
                          className="flex min-h-[68px] w-full flex-col items-center justify-center gap-1 pt-1"
                        >
                          <span className="relative grid h-8 w-14 place-items-center">
                            {active && (
                              <motion.span
                                layoutId="tab-pill"
                                className="absolute inset-0 rounded-full bg-caramel"
                                transition={{ type: 'spring', damping: 28, stiffness: 420 }}
                              />
                            )}
                            <Icon
                              size={22}
                              strokeWidth={active ? 2.5 : 2}
                              className={cn('relative', active ? 'text-on-caramel' : 'text-ink-2')}
                            />
                          </span>
                          <span className={cn('text-xs', active ? 'font-extrabold text-ink' : 'font-semibold text-ink-2')}>
                            {t.label}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </ToastProvider>
          </div>
        </div>
      </StoreProvider>
      </RemoteProvider>
    </MotionConfig>
  )
}
