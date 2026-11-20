import { allMenus, findPreset, NO_DRINK } from '@/logic/menu'
import { cn } from '@/lib/utils'
import type { Order, Size, Temp } from '@/types'

/** 폼 상태. menu가 null이면 "정하지 않음" */
export interface FieldsValue {
  menu: string | null
  temp: Temp
  size?: Size
  shot: boolean
  memo: string
}

export const emptyFields: FieldsValue = { menu: null, temp: 'ice', shot: false, memo: '' }

export function fieldsFromOrder(o?: Order | null): FieldsValue {
  if (!o) return emptyFields
  return { menu: o.menu, temp: o.temp, size: o.size, shot: !!o.shot, memo: o.memo ?? '' }
}

export function orderFromFields(v: FieldsValue): Order | undefined {
  if (!v.menu) return undefined
  const noDrink = v.menu === NO_DRINK
  const memo = v.memo.trim()
  return {
    menu: v.menu,
    temp: findPreset(v.menu)?.fixedTemp ?? v.temp,
    ...(!noDrink && v.size ? { size: v.size } : {}),
    ...(!noDrink && v.shot ? { shot: 1 } : {}),
    ...(!noDrink && memo ? { memo } : {}),
  }
}

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors',
        active ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink hover:brightness-95',
      )}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-sm font-semibold text-ink-2">{children}</p>
}

interface Props {
  value: FieldsValue
  onChange: (v: FieldsValue) => void
  customMenus: string[]
  /** 기본 메뉴 지정처럼 '정하지 않음'을 허용할 때 */
  allowNone?: boolean
  idPrefix: string
}

/** 메뉴·온도·사이즈·샷·메모 입력. 오늘 주문 변경과 기본 메뉴 지정에서 공용 */
export function OrderFields({ value, onChange, customMenus, allowNone, idPrefix }: Props) {
  const set = (p: Partial<FieldsValue>) => onChange({ ...value, ...p })
  const preset = value.menu ? findPreset(value.menu) : undefined
  const showOptions = !!value.menu && value.menu !== NO_DRINK

  return (
    <div className="space-y-5">
      <div>
        <Label>메뉴</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="메뉴">
          {allowNone && (
            <Chip active={value.menu === null} onClick={() => set({ menu: null })}>
              미정
            </Chip>
          )}
          {allMenus(customMenus).map((m) => (
            <Chip key={m} active={value.menu === m} onClick={() => set({ menu: m })}>
              {m}
            </Chip>
          ))}
        </div>
      </div>

      {showOptions && (
        <>
          <div>
            <Label>온도</Label>
            {preset?.fixedTemp ? (
              <p className="text-[15px] text-ink-2">{preset.name}는 {preset.fixedTemp === 'ice' ? '차가운 음료' : '따뜻한 음료'}예요</p>
            ) : (
              <div className="flex gap-2" role="radiogroup" aria-label="온도">
                <Chip active={value.temp === 'ice'} onClick={() => set({ temp: 'ice' })}>
                  아이스
                </Chip>
                <Chip active={value.temp === 'hot'} onClick={() => set({ temp: 'hot' })}>
                  따뜻하게
                </Chip>
              </div>
            )}
          </div>
          <div>
            <Label>옵션 (선택)</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="사이즈와 샷">
              {(['S', 'M', 'L'] as Size[]).map((s) => (
                <Chip key={s} active={value.size === s} onClick={() => set({ size: value.size === s ? undefined : s })} label={`사이즈 ${s}`}>
                  {s}
                </Chip>
              ))}
              <Chip active={value.shot} onClick={() => set({ shot: !value.shot })}>
                샷 추가
              </Chip>
            </div>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-memo`} className="mb-2 block text-sm font-semibold text-ink-2">
              메모 (선택)
            </label>
            <input
              id={`${idPrefix}-memo`}
              value={value.memo}
              maxLength={20}
              onChange={(e) => set({ memo: e.target.value })}
              placeholder="예) 덜 달게"
              className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base placeholder:text-ink-2/70"
            />
          </div>
        </>
      )}
    </div>
  )
}
