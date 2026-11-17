// public/icon.svg → PWA용 PNG 아이콘 생성 (npm run icons)
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url))
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(decodeURIComponent(out(name)))
}

// maskable: 안전영역(중앙 80%) 안에 들어오도록 컵을 줄이고 배경은 꽉 채움
const inner = await sharp(svg, { density: 384 }).resize(380, 380).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#3e2723' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(decodeURIComponent(out('icon-maskable-512.png')))
console.log('icons done')
