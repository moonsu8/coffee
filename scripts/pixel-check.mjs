// 커피 그룹 화면 12장(홈·기록·휴가·통계·설정·기록 추가 시트 × 라이트·다크)을 캡처해 기준 이미지와 비교한다.
// 서버 연결 환경 변수가 없는 상태의 화면이 바뀌지 않았는지 보는 용도다.
//
// 준비: npm i --no-save playwright-core  (저장소 의존성이 아니다) / 설치된 Chrome 사용
//       .env.local을 잠시 치우고 `npx vite --port 5199 --host 127.0.0.1` 로 개발 서버를 띄운다(서버 값이 없는 화면).
// 사용: node scripts/pixel-check.mjs            → 기준(.pixel-baseline/)과 비교, 다르면 종료 코드 1
//       node scripts/pixel-check.mjs --update   → 지금 화면을 새 기준으로 저장
// 기준 이미지는 이 컴퓨터의 Chrome·글꼴로 찍은 것이라 커밋하지 않는다(.gitignore). 다른 환경에서는 --update로 다시 만든다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright-core/index.mjs')).href)
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199/'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const update = process.argv.includes('--update')
const baseDir = path.join(root, '.pixel-baseline')
const outDir = update ? baseDir : path.join(root, '.pixel-current')
fs.mkdirSync(outDir, { recursive: true })

const names = ['가람', '나래', '다온', '라온', '마루', '바다']
const seed = {
  schemaVersion: 4,
  members: [],
  updatedAt: 1,
  groups: [
    {
      id: 'g-coffee',
      name: '커피',
      emoji: '☕',
      schedule: 'weekdays',
      config: { presetId: 'coffee', actionLabel: '샀어요', fairness: 'money', orders: true, memoPlaceholder: '예) 아아 6잔, 디저트 포함', shareFormat: '☕', themeId: 'coffee' },
      members: names.map((n, i) => ({ id: 'm' + i, name: n, order: i + 1, favorite: i % 2 ? { menu: '카페라떼', temp: 'hot' } : { menu: '아메리카노', temp: 'ice' } })),
      records: [
        { date: '2026-11-09', memberId: 'm0' },
        { date: '2026-11-10', memberId: 'm1' },
        { date: '2026-11-11', memberId: 'm2' },
        { date: '2026-11-12', memberId: 'm3' },
        { date: '2026-11-13', memberId: 'm0' },
        { date: '2026-11-16', memberId: 'm1' },
      ],
      absences: [{ id: 'a1', memberId: 'm4', from: '2026-11-18', to: '2026-11-19' }],
      skipDays: ['2026-11-20'],
      coffee: { orders: [], customMenus: [], priceList: [], settings: { buyerRule: 'count', defaultPriceMode: 'none' } },
    },
  ],
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce', locale: 'ko-KR' })
  await ctx.clock.install({ time: new Date('2026-11-18T10:00:00+09:00') })
  await ctx.clock.pauseAt(new Date('2026-11-18T10:00:00+09:00'))
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('coffee-duty:v1')) localStorage.setItem('coffee-duty:v1', JSON.stringify(s))
    localStorage.setItem('coffee-duty:install-dismissed', String(Date.now() + 1e12))
  }, seed)
  const page = await ctx.newPage()
  await page.goto(BASE)
  await page.waitForSelector('nav button')
  await page.waitForTimeout(800)
  for (const t of ['홈', '기록', '휴가', '통계', '설정']) {
    await page.locator('nav button', { hasText: t }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(outDir, `${scheme}-${t}.png`) })
  }
  await page.locator('nav button', { hasText: '기록' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /기록 추가/ }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, `${scheme}-시트.png`) })
  await ctx.close()
}
await browser.close()

if (update) {
  console.log(`기준 이미지 12장을 ${baseDir} 에 저장했어요`)
  process.exit(0)
}
let diff = 0
for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith('.png'))) {
  const b = path.join(baseDir, f)
  if (!fs.existsSync(b)) {
    console.log('기준 없음', f)
    diff++
  } else if (!fs.readFileSync(b).equals(fs.readFileSync(path.join(outDir, f)))) {
    console.log('다름', f)
    diff++
  }
}
console.log(diff === 0 ? '픽셀 차이 0 (12장 모두 같음)' : `다른 화면 ${diff}장 (.pixel-current/ 와 .pixel-baseline/ 을 비교하세요)`)
process.exit(diff === 0 ? 0 : 1)
