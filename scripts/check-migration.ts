/**
 * 일회성 검증: backup/*.json (총무 폰에서 내보낸 실제 데이터)을 v1 → v2로 마이그레이션하고
 * members·purchases·absences·skipDays의 개수와 값이 그대로인지 확인한다.
 *
 *   npm run check:migration
 *
 * - 원본 파일은 읽기만 한다 (수정하지 않음)
 * - 실명·메모 등 내용은 출력하지 않는다. 개수와 일치 여부만 출력한다
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { migrate, versionOf } from '../src/lib/migrate'

type R = Record<string, unknown>
const dir = join(import.meta.dirname, '..', 'backup')

const arr = (v: unknown): R[] => (Array.isArray(v) ? (v as R[]) : [])
const j = (v: unknown) => JSON.stringify(v ?? null)
const nz = (v: unknown) => (v === '' || v === undefined ? null : v) // 빈 메모 == 메모 없음

interface Row {
  name: string
  rawCount: number
  newCount: number
  mismatched: number // 값이 다른(또는 사라진) 항목 수
  note?: string
}

/** 키로 짝지어 비교. 짝이 없거나 값이 다르면 불일치 1건 */
function compareByKey(raw: R[], out: R[], key: (x: R) => string, pick: (x: R) => unknown): number {
  const o = new Map(out.map((x) => [key(x), x]))
  let bad = 0
  for (const r of raw) {
    const m = o.get(key(r))
    if (!m || j(pick(r)) !== j(pick(m))) bad++
  }
  return bad
}

function check(file: string): { rows: Row[]; extra: string[]; ok: boolean } {
  const json = JSON.parse(readFileSync(file, 'utf8')) as R
  const version = versionOf(json)
  const out = migrate(json, 0)

  const rawM = arr(json.members)
  const rawP = arr(json.purchases)
  const rawA = arr(json.absences)
  const rawS = Array.isArray(json.skipDays) ? (json.skipDays as string[]) : []

  const dupDates = rawP.length - new Set(rawP.map((p) => p.date)).size
  const dupSkip = rawS.length - new Set(rawS).size

  const rows: Row[] = [
    {
      name: 'members',
      rawCount: rawM.length,
      newCount: out.members.length,
      mismatched: compareByKey(
        rawM,
        out.members as unknown as R[],
        (x) => String(x.id),
        (x) => [x.name, x.order, nz(x.color), nz(x.emoji)],
      ),
    },
    {
      name: 'purchases',
      rawCount: rawP.length,
      newCount: out.purchases.length,
      mismatched: compareByKey(
        rawP,
        out.purchases as unknown as R[],
        (x) => String(x.date),
        (x) => [x.memberId, nz(x.memo)],
      ),
      note: dupDates ? `원본에 같은 날짜 중복 ${dupDates}건` : undefined,
    },
    {
      name: 'absences',
      rawCount: rawA.length,
      newCount: out.absences.length,
      mismatched: compareByKey(
        rawA,
        out.absences as unknown as R[],
        (x) => String(x.id),
        (x) => [x.memberId, x.from, x.to],
      ),
    },
    {
      name: 'skipDays',
      rawCount: rawS.length,
      newCount: out.skipDays.length,
      mismatched: rawS.filter((d) => !out.skipDays.includes(d)).length,
      note: dupSkip ? `원본에 중복 ${dupSkip}건 (중복 제거됨)` : undefined,
    },
  ]

  const extra: string[] = []
  const expect = (label: string, ok: boolean) => extra.push(`${ok ? '✓' : '✗'} ${label}`)
  expect(`schemaVersion ${version} → ${out.schemaVersion}`, out.schemaVersion === 2)
  if (version < 2) {
    expect('새 필드 기본값 (orders 0건, customMenus 0건, 기본 메뉴 없음)', out.orders.length === 0 && out.customMenus.length === 0 && out.members.every((m) => !m.favorite))
  }
  // 금액 기능 이전의 기록은 '금액 없음' 그대로여야 한다 (원본에 금액이 없었다면 변환 후에도 없어야 함)
  const rawHasMoney = rawP.some((p) => p.pricing !== undefined) || (Array.isArray(json.priceList) && json.priceList.length > 0)
  if (!rawHasMoney) {
    expect(
      '기존 구매 기록은 금액 없음 그대로 (금액 0건, 가격표 0건, 당번 기준 횟수)',
      out.purchases.every((p) => !p.pricing) && out.priceList.length === 0 && out.settings.buyerRule === 'count',
    )
  }
  // 한 번 더 옮겨도 결과가 같은지 (저장 후 다시 열 때 값이 변하지 않는지)
  const again = migrate(JSON.parse(JSON.stringify(out)), 0)
  expect('다시 읽어도 동일 (멱등)', j(again) === j(out))

  const rowOk = (r: Row) => r.rawCount === r.newCount && r.mismatched === 0
  // 중복 제거는 의도된 정규화라 개수 차이가 중복 건수와 같으면 허용
  const okRows = rows.map((r) => {
    const dup = r.name === 'purchases' ? dupDates : r.name === 'skipDays' ? dupSkip : 0
    return rowOk(r) || (r.rawCount - r.newCount === dup && r.mismatched <= dup)
  })
  const ok = okRows.every(Boolean) && extra.every((e) => e.startsWith('✓'))
  rows.forEach((r, i) => (r.note = [r.note, okRows[i] ? undefined : '확인 필요'].filter(Boolean).join(' · ') || undefined))
  return { rows, extra, ok }
}

function main() {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
  if (files.length === 0) {
    console.log('backup/ 폴더에 .json 파일이 없어요.')
    console.log('총무 폰에서 내보낸 JSON을 backup/ 에 넣고 다시 실행해 주세요.')
    process.exit(1)
  }

  let allOk = true
  files.forEach((f, i) => {
    const path = join(dir, f)
    // 파일명에 실명이 있을 수 있어 번호로만 표시
    console.log(`\n파일 ${i + 1}/${files.length} (${(statSync(path).size / 1024).toFixed(1)} KB)`)
    try {
      const { rows, extra, ok } = check(path)
      for (const r of rows) {
        const state = r.rawCount === r.newCount && r.mismatched === 0 ? '일치' : '차이'
        console.log(
          `  ${r.name.padEnd(10)} 원본 ${String(r.rawCount).padStart(4)} → 변환 ${String(r.newCount).padStart(4)}   값 불일치 ${r.mismatched}건   ${state}${r.note ? `   (${r.note})` : ''}`,
        )
      }
      extra.forEach((e) => console.log(`  ${e}`))
      console.log(`  결과: ${ok ? '통과 ✓ 기존 데이터가 그대로 보존돼요' : '실패 ✗ push하지 마세요'}`)
      allOk &&= ok
    } catch (e) {
      allOk = false
      console.log(`  결과: 실패 ✗ ${e instanceof Error ? e.message : '읽을 수 없는 파일'}`)
    }
  })
  console.log(`\n${allOk ? '전체 통과' : '실패한 파일이 있어요'}`)
  process.exit(allOk ? 0 : 1)
}

main()
