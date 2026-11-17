import { motion } from 'framer-motion'
import { Check, Copy, EllipsisVertical, ExternalLink, Share, SquarePlus, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { copyText } from '@/lib/effects'
import { useInstall } from '@/lib/install'
import { cn } from '@/lib/utils'
import { LogoMark } from './illustrations'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'

function Step({ n, icon: Icon, children }: { n: number; icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 rounded-2xl bg-surface-2 p-3.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-espresso text-sm font-extrabold text-[#faf6f0]">
        {n}
      </span>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-caramel-ink shadow-card">
        <Icon size={22} />
      </span>
      <span className="text-[15px] leading-snug font-medium">{children}</span>
    </li>
  )
}

const pageUrl = () => location.origin + location.pathname

/** 설치 방법 안내 시트. 환경(iOS / 인앱 / Android·PC)에 맞춰 내용이 바뀐다 */
export function InstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { env, standalone, canPrompt, install } = useInstall()
  const toast = useToast()

  const copyUrl = async () => {
    const ok = await copyText(pageUrl())
    toast({ message: ok ? '주소를 복사했어요. 브라우저에 붙여넣어 주세요' : '복사에 실패했어요', duration: 3000 })
  }

  let title = '앱 설치 방법'
  let body: ReactNode

  if (standalone) {
    title = '이미 설치되어 있어요'
    body = (
      <div className="flex items-center gap-3 rounded-2xl bg-mint/30 p-4 text-[15px] font-semibold text-mint-ink">
        <Check size={20} /> 지금 앱으로 실행 중이에요. 따로 할 일이 없어요.
      </div>
    )
  } else if (env.kind === 'inapp') {
    title = '브라우저로 열어 주세요'
    body = (
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-ink-2">
          카카오톡·네이버 같은 앱 안의 화면에서는 설치할 수 없어요.{' '}
          {env.android ? 'Chrome(또는 삼성 인터넷)' : 'Safari'}로 열어 주세요.
        </p>
        <ol className="space-y-2.5">
          {env.android ? (
            <Step n={1} icon={EllipsisVertical}>
              오른쪽 위 메뉴(⋮)에서 <b>다른 브라우저로 열기</b>
            </Step>
          ) : (
            <Step n={1} icon={ExternalLink}>
              화면 모서리의 메뉴에서 <b>Safari로 열기</b>
            </Step>
          )}
        </ol>
        {env.kakao && env.android && (
          <Button size="lg" className="w-full" asChild>
            <a href={`kakaotalk://web/openExternal?url=${encodeURIComponent(pageUrl())}`}>
              <ExternalLink size={19} /> 외부 브라우저로 열기
            </a>
          </Button>
        )}
        <Button variant="soft" size="lg" className="w-full" onClick={copyUrl}>
          <Copy size={18} /> 주소 복사하기
        </Button>
      </div>
    )
  } else if (env.kind === 'ios') {
    body = (
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">아이폰·아이패드는 브라우저 메뉴에서 직접 추가해요.</p>
        <ol className="space-y-2.5">
          <Step n={1} icon={Share}>
            아래쪽 <b>공유 버튼</b>을 눌러요
          </Step>
          <Step n={2} icon={SquarePlus}>
            목록을 내려서 <b>홈 화면에 추가</b>를 눌러요
          </Step>
          <Step n={3} icon={Check}>
            오른쪽 위 <b>추가</b>를 누르면 끝!
          </Step>
        </ol>
        <p className="text-[13px] text-ink-2">공유 버튼이 안 보이면 주소창 옆 ‧‧‧ 을 눌러 보세요. Safari 사용을 권장해요.</p>
      </div>
    )
  } else if (canPrompt) {
    body = (
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">홈 화면에 추가하면 앱처럼 바로 열 수 있어요.</p>
        <Button
          size="lg"
          className="w-full"
          onClick={async () => {
            onOpenChange(false)
            await install()
          }}
        >
          앱으로 설치하기
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        <ol className="space-y-2.5">
          <Step n={1} icon={EllipsisVertical}>
            브라우저 메뉴(⋮)를 열어요
          </Step>
          <Step n={2} icon={SquarePlus}>
            <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요
          </Step>
        </ol>
        <p className="text-[13px] text-ink-2">PC Chrome은 주소창 오른쪽의 설치 아이콘을 눌러요. 항목이 없으면 이미 설치했거나 지원하지 않는 브라우저예요.</p>
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="pb-2">{body}</div>
    </Sheet>
  )
}

/** 홈 하단 설치 배너. 설치됨/7일 이내 닫음이면 렌더하지 않는다 */
export function InstallBanner({ className }: { className?: string }) {
  const { banner, install, dismiss } = useInstall()
  const [open, setOpen] = useState(false)
  if (!banner) return <InstallSheet open={open} onOpenChange={setOpen} />

  const copy = {
    prompt: { title: '앱으로 설치하기', sub: '홈 화면에서 바로 열고, 더 빠르게 써요', cta: '설치' },
    ios: { title: '홈 화면에 추가하기', sub: '아이콘을 눌러 앱처럼 열어요', cta: '방법 보기' },
    inapp: { title: '브라우저로 열어 주세요', sub: '앱 안에서는 설치할 수 없어요', cta: '방법 보기' },
  }[banner]

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        aria-label="앱 설치 안내"
        className={cn('rounded-card border border-caramel/45 bg-caramel/12 p-4', className)}
      >
        <div className="flex items-center gap-3.5">
          <LogoMark className="size-12 shrink-0 drop-shadow-sm" />
          <div className="min-w-0">
            <p className="text-[17px] leading-tight font-extrabold">{copy.title}</p>
            <p className="mt-0.5 text-sm text-ink-2">{copy.sub}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => (banner === 'prompt' ? install() : setOpen(true))}>
            {copy.cta}
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            다음에 하기
          </Button>
        </div>
      </motion.section>
      <InstallSheet open={open} onOpenChange={setOpen} />
    </>
  )
}
