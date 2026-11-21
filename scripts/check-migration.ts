/**
 * 일회성 검증: backup/*.json (총무 폰에서 내보낸 실제 데이터)을 최신 구조(v3)로 마이그레이션하고,
 * 멤버·기록(구매)·휴가·쉬는 날·주문·금액·가격표·설정이 개수와 값까지 그대로인지 확인한다.
 *
 *   npm run check:migration
 *
 * - v1/v2 파일: 전부 "커피" 그룹 하나로 옮겨졌는지(값 비교)
 * - v3 파일: 그룹마다 왕복(읽기→저장→읽기) 결과가 원본과 같은지
 * - 원본 파일은 읽기만 한다 (수정하지 않음)
 * - 실명·메모 등 내용은 출력하지 않는다. 개수와 일치 여부만 출력한다
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { migrate, serialize, versionOf } from '../src/lib/migrate'
import type { Group } from '../src/types'

type R = Record<string, unknown>
const dir = join(import.meta.dirname, '..', 'backup')

const arr = (v: unknown): R[] => (Array.isArray(v) ? (v as R[]) : [])
/** 키 순서와 undefined 필드에 상관없이 값이 같으면 같은 문자열 (정규화로 키 순서가 바뀌어도 오탐하지 않도록) */
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as R)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, x]) => [k, canon(x)]),
        )
      : v
const j = (v: unknown) => JSON.stringify(canon(v ?? null))
const nz = (v: unknown) => (v === '' || v === undefined ? null : v) // 빈 메모 == 메모 없음

interface Row {
  name: string
  rawCount: number
  newCount: number
  mismatched: number // 값이 다른(또는 사라진) 항목 수
  allowed: number // 의도된 정규화(중복 제거)로 줄어든 개수
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

/** 그룹 한 개분(v2까지의 모양으로 정리한 원본)과 변환 결과를 비교한 행들 */
interface RawContent {
  members: R[]
  records: R[]
  absences: R[]
  skipDays: string[]
  orders?: R[]
  customMenus?: string[]
  priceList?: R[]
}

function rowsFor(raw: RawContent, out: Group): Row[] {
  const dupDates = raw.records.length - new Set(raw.records.map((p) => p.date)).size
  const dupSkip = raw.skipDays.length - new Set(raw.skipDays).size
  const rows: Row[] = [
    {
      name: 'members',
      rawCount: raw.members.length,
      newCount: out.members.length,
      allowed: 0,
      mismatched: compareByKey(raw.members, out.members as unknown as R[], (x) => String(x.id), (x) => [x.name, x.order, nz(x.color), nz(x.emoji), x.favorite ?? null]),
    },
    {
      name: 'records',
      rawCount: raw.records.length,
      newCount: out.records.length,
      allowed: dupDates,
      mismatched: compareByKey(raw.records, out.records as unknown as R[], (x) => String(x.date), (x) => [x.memberId, nz(x.memo), x.pricing ?? null]),
    },
    {
      name: 'absences',
      rawCount: raw.absences.length,
      newCount: out.absences.length,
      allowed: 0,
      mismatched: compareByKey(raw.absences, out.absences as unknown as R[], (x) => String(x.id), (x) => [x.memberId, x.from, x.to]),
    },
    {
      name: 'skipDays',
      rawCount: raw.skipDays.length,
      newCount: out.skipDays.length,
      allowed: dupSkip,
      mismatched: raw.skipDays.filter((d) => !out.skipDays.includes(d)).length,
    },
  ]
  if (out.coffee) {
    const c = out.coffee
    const rawOrders = raw.orders ?? []
    rows.push({
      name: 'orders',
      rawCount: rawOrders.length,
      newCount: c.orders.length,
      allowed: 0,
      mismatched: compareByKey(rawOrders, c.orders as unknown as R[], (x) => String(x.date), (x) => x.items),
    })
    const rawPrices = raw.priceList ?? []
    const pk = (x: R) => [x.menu, x.temp, x.size ?? ''].join('|')
    rows.push({
      name: 'priceList',
      rawCount: rawPrices.length,
      newCount: c.priceList.length,
      allowed: 0,
      mismatched: compareByKey(rawPrices, c.priceList as unknown as R[], pk, (x) => x.price),
    })
    const rawMenus = raw.customMenus ?? []
    rows.push({
      name: 'customMenus',
      rawCount: rawMenus.length,
      newCount: c.customMenus.length,
      allowed: 0,
      mismatched: rawMenus.filter((m) => !c.customMenus.includes(m)).length,
    })
  }
  return rows
}

const rowOk = (r: Row) => (r.rawCount === r.newCount && r.mismatched === 0) || (r.rawCount - r.newCount === r.allowed && r.mismatched <= r.allowed)

function check(file: string): { sections: { title: string; rows: Row[] }[]; extra: string[]; ok: boolean } {
  const json = JSON.parse(readFileSync(file, 'utf8')) as R
  const version = versionOf(json)
  const out = migrate(json, 0)
  const extra: string[] = []
  const expect = (label: string, ok: boolean) => extra.push(`${ok ? '✓' : '✗'} ${label}`)
  const sections: { title: string; rows: Row[] }[] = []

  expect(`schemaVersion ${version} → ${out.schemaVersion}`, out.schemaVersion === 3)

  if (version < 3) {
    // v1/v2 → 전부 "커피" 그룹 하나
    const raw: RawContent = {
      members: arr(json.members),
      records: arr(json.purchases),
      absences: arr(json.absences),
      skipDays: Array.isArray(json.skipDays) ? (json.skipDays as string[]) : [],
      orders: arr(json.orders),
      customMenus: Array.isArray(json.customMenus) ? (json.customMenus as string[]) : [],
      priceList: arr(json.priceList),
    }
    const g = out.groups[0]
    expect('그룹 1개, 템플릿 커피 (기존 데이터 전부가 한 그룹으로)', out.groups.length === 1 && g.template === 'coffee')
    sections.push({ title: '커피 그룹', rows: rowsFor(raw, g) })

    const s = (json.settings ?? null) as R | null
    expect(
      s ? '설정(당번 기준·금액 기본값·정산 시작일)이 값 그대로' : '설정 기본값 (v1: 당번 기준 횟수)',
      s ? j(g.coffee?.settings) === j({ buyerRule: s.buyerRule, defaultPriceMode: s.defaultPriceMode, ...(s.balanceSince ? { balanceSince: s.balanceSince } : {}) }) : g.coffee?.settings.buyerRule === 'count',
    )
    // 금액 기능 이전의 기록은 '금액 없음' 그대로
    const rawHasMoney = raw.records.some((p) => p.pricing !== undefined) || (raw.priceList ?? []).length > 0
    if (!rawHasMoney) expect('기존 구매 기록은 금액 없음 그대로 (금액 0건, 가격표 0건)', g.records.every((p) => !p.pricing) && (g.coffee?.priceList.length ?? 0) === 0)
  } else {
    // v3 → 그룹마다 비교
    const rawGroups = arr(json.groups)
    expect('그룹 수 일치', rawGroups.length === out.groups.length)
    rawGroups.forEach((rg, i) => {
      const og = out.groups[i]
      if (!og) return
      const c = (rg.coffee ?? {}) as R
      sections.push({
        title: `그룹 ${i + 1} (${og.template === 'coffee' ? '커피' : '일반'})`,
        rows: rowsFor(
          {
            members: arr(rg.members),
            records: arr(rg.records),
            absences: arr(rg.absences),
            skipDays: Array.isArray(rg.skipDays) ? (rg.skipDays as string[]) : [],
            orders: arr(c.orders),
            customMenus: Array.isArray(c.customMenus) ? (c.customMenus as string[]) : [],
            priceList: arr(c.priceList),
          },
          og,
        ),
      })
    })
  }

  // 저장(직렬화) 후 다시 읽어도 같은지, 옛 앱 보호 표식이 있는지
  const text = serialize(out)
  expect('저장 후 다시 읽어도 동일 (멱등)', j(migrate(JSON.parse(text), 0)) === j(out))
  const saved = JSON.parse(text) as R
  expect('옛 앱 보호 표식 (최상위 members 배열 + 더 높은 schemaVersion)', Array.isArray(saved.members) && (saved.schemaVersion as number) > 2)

  const ok = sections.every((s) => s.rows.every(rowOk)) && extra.every((e) => e.startsWith('✓'))
  return { sections, extra, ok }
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
      const { sections, extra, ok } = check(path)
      for (const sec of sections) {
        console.log(`  [${sec.title}]`)
        for (const r of sec.rows) {
          const note = r.allowed && r.rawCount !== r.newCount ? `   (원본 중복 ${r.allowed}건 제거)` : ''
          console.log(
            `    ${r.name.padEnd(11)} 원본 ${String(r.rawCount).padStart(4)} → 변환 ${String(r.newCount).padStart(4)}   값 불일치 ${r.mismatched}건   ${rowOk(r) ? '일치' : '차이 ✗'}${note}`,
          )
        }
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
