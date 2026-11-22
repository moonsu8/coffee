import { ChevronDown, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, MemberPicker, PageHeader, SectionTitle } from '@/components/common'
import { EmptyCup } from '@/components/illustrations'
import { MonthGrid, MonthNav } from '@/components/month-grid'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { diffDays, formatMD, formatShort, monthKey } from '@/logic/dates'
import { useStore } from '@/store/store'
import type { Absence, DateStr } from '@/types'

export function AbsencesScreen() {
  const { data, groups, today, memberById, addAbsence, addAbsenceAll, removeAbsence, addSkipDay, removeSkipDay, access } = useStore()
  const canWrite = access.canWrite
  const [everywhere, setEverywhere] = useState(false)
  const toast = useToast()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [month, setMonth] = useState(monthKey(today))
  const [from, setFrom] = useState<DateStr | null>(null)
  const [to, setTo] = useState<DateStr | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [skipInput, setSkipInput] = useState('')

  const pick = (d: DateStr) => {
    if (!from || to) {
      setFrom(d)
      setTo(null)
    } else if (d < from) {
      setTo(from)
      setFrom(d)
    } else setTo(d)
  }
  const rangeEnd = to ?? from
  const inRange = (d: DateStr) => !!from && !!rangeEnd && d >= from && d <= rangeEnd

  const submit = () => {
    if (!memberId || !from) return
    const end = to ?? from
    const name = memberById(memberId)?.name
    if (everywhere && groups.length > 1) {
      // 멤버는 그룹마다 따로라서 이름이 같은 멤버로 연결한다
      const r = addAbsenceAll(memberId, from, end)
      const skipped = r.noMatch + r.ambiguous
      toast({
        message:
          `${name}님 휴가를 ${r.applied}개 그룹에 등록했어요` +
          (skipped > 0 ? ` (이름이 맞는 멤버가 없거나 여러 명인 ${skipped}개 그룹은 건너뜀)` : ''),
        actionLabel: '되돌리기',
        onAction: r.undo,
        duration: 7000,
      })
    } else {
      const undo = addAbsence(memberId, from, end)
      toast({ message: `${name}님 휴가를 등록했어요`, actionLabel: '되돌리기', onAction: undo })
    }
    setFrom(null)
    setTo(null)
  }

  const del = (a: Absence) => {
    const undo = removeAbsence(a.id)
    toast({ message: '휴가를 삭제했어요', actionLabel: '되돌리기', onAction: undo })
  }

  const sorted = [...data.absences].sort((a, b) => (a.from < b.from ? -1 : 1))
  const upcoming = sorted.filter((a) => a.to >= today)
  const past = sorted.filter((a) => a.to < today).reverse()

  return (
    <div className="pb-8">
      <PageHeader title="휴가" subtitle="VACATION" />
      <div className="space-y-5 px-5">
        {canWrite && (
        <Card>
          <SectionTitle>휴가 등록</SectionTitle>
          <p className="mb-2 text-sm font-semibold text-ink-2">누가 쉬나요?</p>
          <MemberPicker members={data.members} value={memberId} onChange={setMemberId} />

          <p className="mt-5 mb-1 text-sm font-semibold text-ink-2">언제부터 언제까지?</p>
          <MonthNav month={month} onChange={setMonth} />
          <MonthGrid
            month={month}
            today={today}
            onSelect={pick}
            dayLabel={(d) => `${formatShort(d)} 선택`}
            dayClassName={(d) =>
              cn(
                inRange(d) && 'bg-mint/40',
                (d === from || d === rangeEnd) && 'bg-mint font-bold text-[#1d3a2e]',
              )
            }
          />
          <div className="mt-3 flex min-h-11 items-center justify-center rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold">
            {from ? (
              <span>
                {formatShort(from)}
                {rangeEnd && rangeEnd !== from ? ` ~ ${formatShort(rangeEnd)}` : ''}{' '}
                <span className="text-ink-2">· {diffDays(rangeEnd ?? from, from) + 1}일</span>
              </span>
            ) : (
              <span className="text-ink-2">달력에서 시작일과 종료일을 눌러 주세요</span>
            )}
          </div>
          {groups.length > 1 && access.kind === 'local' && (
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
              <input
                type="checkbox"
                checked={everywhere}
                onChange={(e) => setEverywhere(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--caramel)]"
              />
              <span>
                <span className="block text-[15px] font-semibold">모든 그룹에 적용</span>
                <span className="block text-[13px] leading-snug text-ink-2">이름이 같은 멤버가 있는 그룹에 함께 등록해요.</span>
              </span>
            </label>
          )}
          <Button size="lg" className="mt-3 w-full" disabled={!memberId || !from} onClick={submit}>
            휴가 등록하기
          </Button>
        </Card>
        )}

        <section>
          <SectionTitle>다가오는 휴가</SectionTitle>
          {upcoming.length === 0 ? (
            <Card>
              <EmptyState
                illustration={<EmptyCup variant="palm" />}
                title="예정된 휴가가 없어요"
                body="휴가를 등록하면 그 기간엔 당번에서 빠져요."
              />
            </Card>
          ) : (
            <ol className="relative ml-2 space-y-3 border-l-2 border-mint/60 pl-6">
              {upcoming.map((a) => {
                const m = memberById(a.memberId)
                const ongoing = a.from <= today
                const dday = diffDays(a.from, today)
                return (
                  <li key={a.id} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-6 -left-[33px] size-4 rounded-full border-[3px] border-bg',
                        ongoing ? 'bg-mint ring-4 ring-mint/35' : 'bg-mint/70',
                      )}
                    />
                    <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3 pl-4 shadow-card">
                      <Avatar member={m} size="md" absent={ongoing} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-bold">{m?.name ?? '탈퇴한 멤버'}</p>
                        <p className="text-sm text-ink-2">
                          {formatMD(a.from)}
                          {a.to !== a.from && ` ~ ${formatMD(a.to)}`} · {diffDays(a.to, a.from) + 1}일
                        </p>
                      </div>
                      <span className="rounded-full bg-mint/35 px-2.5 py-1 text-xs font-bold text-mint-ink">
                        {ongoing ? '휴가 중' : `D-${dday}`}
                      </span>
                      {canWrite && (
                      <button
                        aria-label={`${m?.name} 휴가 삭제`}
                        onClick={() => del(a)}
                        className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={19} />
                      </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {past.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-2xl px-2 text-sm font-semibold text-ink-2"
                aria-expanded={showPast}
              >
                지난 휴가 {past.length}건
                <ChevronDown size={18} className={cn('transition-transform', showPast && 'rotate-180')} />
              </button>
              {showPast && (
                <ul className="mt-1 divide-y divide-line rounded-[20px] bg-surface px-4 shadow-card">
                  {past.map((a) => (
                    <li key={a.id} className="flex min-h-14 items-center gap-3 py-1.5">
                      <Avatar member={memberById(a.memberId)} size="sm" />
                      <span className="flex-1 text-[15px]">
                        <b>{memberById(a.memberId)?.name ?? '탈퇴한 멤버'}</b>{' '}
                        <span className="text-ink-2">
                          {formatMD(a.from)}
                          {a.to !== a.from && ` ~ ${formatMD(a.to)}`}
                        </span>
                      </span>
                      {canWrite && (
                      <button aria-label="휴가 삭제" onClick={() => del(a)} className="grid size-11 place-items-center rounded-full text-ink-2 hover:text-danger">
                        <Trash2 size={18} />
                      </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <Card>
          <SectionTitle>쉬는 날 (공휴일·회식 등)</SectionTitle>
          <p className="mb-3 text-sm text-ink-2">여기에 넣은 날은 당번 계산에서 빠져요. {data.schedule === 'weekdays' ? '주말은' : '담당 요일이 아닌 날은'} 자동으로 제외돼요.</p>
          {canWrite && (
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="쉬는 날 선택"
              value={skipInput}
              onChange={(e) => setSkipInput(e.target.value)}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold"
            />
            <Button
              variant="dark"
              disabled={!skipInput}
              onClick={() => {
                addSkipDay(skipInput)
                setSkipInput('')
              }}
            >
              추가
            </Button>
          </div>
          )}
          {data.skipDays.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.skipDays.map((d) => (
                <li key={d} className="flex items-center rounded-full bg-mint/30 pl-3.5 text-sm font-semibold text-mint-ink">
                  {formatShort(d)}
                  {canWrite ? (
                  <button aria-label={`${formatShort(d)} 쉬는 날 삭제`} onClick={() => removeSkipDay(d)} className="grid size-11 place-items-center rounded-full">
                    <X size={16} />
                  </button>
                  ) : (
                    <span className="pr-3.5" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
