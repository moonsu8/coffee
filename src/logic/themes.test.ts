import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME_IDS } from '../types'
import { PRESETS } from './templates'
import { contrast, contrastPairs, paletteVars, THEMES, themeCss, themeOf, themeVars } from './themes'

const SCHEMES = ['light', 'dark'] as const

describe('테마 글자 대비 (WCAG AA, 모든 테마 × 라이트/다크)', () => {
  for (const id of THEME_IDS) {
    for (const scheme of SCHEMES) {
      it(`${id} ${scheme}: 본문·보조·버튼·포인트·히어로·의미 색 글자가 모두 4.5:1 이상`, () => {
        const fails = contrastPairs(id, scheme)
          .map((p) => ({ ...p, ratio: contrast(p.fg, p.bg) }))
          .filter((p) => p.ratio < p.min)
          .map((p) => `${p.name} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}`)
        expect(fails).toEqual([])
      })
    }
  }

  it('대비 계산이 기준값과 맞다 (흑백 21:1, 같은 색 1:1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})

describe('테마 정의', () => {
  it('테마는 8개이고 프리셋·직접 만들기가 쓰는 themeId가 모두 정의돼 있다', () => {
    expect([...THEME_IDS]).toEqual(['coffee', 'lunch', 'notes', 'stage', 'clean', 'recycle', 'dishes', 'walk'])
    for (const p of PRESETS) expect(THEMES[p.themeId]).toBeDefined()
    expect(themeOf('nope' as never).id).toBe('coffee') // 알 수 없는 id는 커피
  })

  it('모든 색이 #rrggbb 형식', () => {
    for (const id of THEME_IDS) for (const s of SCHEMES) for (const [k, v] of Object.entries(THEMES[id][s])) expect(v, `${id}.${s}.${k}`).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('의미 색(휴가 민트·경고)과 멤버 색은 테마 변수에 들어 있지 않다', () => {
    const keys = Object.keys(themeVars('lunch', 'light'))
    for (const k of ['--mint', '--mint-ink', '--danger']) expect(keys).not.toContain(k)
  })

  it('포인트 색 위 글자는 어두운 색 (포인트색보다 어둡다)', () => {
    const lum = (hex: string) => contrast(hex, '#000000')
    for (const id of THEME_IDS) for (const s of SCHEMES) expect(lum(THEMES[id][s].onAccent)).toBeLessThan(lum(THEMES[id][s].accent))
  })

  it('커피 외 테마 CSS가 data-theme 선택자로 라이트·다크 두 벌 만들어진다', () => {
    const css = themeCss()
    for (const id of THEME_IDS.filter((x) => x !== 'coffee')) {
      expect(css).toContain(`:root[data-theme="${id}"]{`)
    }
    expect(css).not.toContain('data-theme="coffee"') // 커피는 index.css 기본값
    expect(css.match(/@media \(prefers-color-scheme: dark\)/g)).toHaveLength(THEME_IDS.length - 1)
  })
})

describe('커피 테마 = 지금 index.css 그대로 (기존 커피 화면 불변)', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
  const vars = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  const root = vars(css.match(/:root\s*\{([^}]*)\}/)![1])
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)![1]
  const dark = { ...root, ...vars(darkBlock) }

  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ')
  for (const [scheme, actual] of [['light', root], ['dark', dark]] as const) {
    it(`${scheme}: THEMES.coffee가 만든 변수가 index.css 값과 같다`, () => {
      const want = paletteVars(THEMES.coffee[scheme], scheme)
      for (const [k, v] of Object.entries(want)) expect(norm(actual[k] ?? '(없음)'), `${scheme} ${k}`).toBe(norm(v))
    })
  }
})
