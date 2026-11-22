import { remoteEnabled } from '@/remote/api'

/**
 * 개인정보 안내 한 줄. 서버 공유가 켜진 빌드에서만 보인다(서버에 저장될 수 있는 입력칸 아래).
 * 공유를 쓰지 않는 빌드에서는 아무것도 그리지 않아 화면이 그대로다.
 */
export function PrivacyHint({ kind }: { kind: 'name' | 'memo' }) {
  if (!remoteEnabled) return null
  return (
    <p className="mt-1.5 text-[12px] leading-snug text-ink-2">
      {kind === 'name' ? '실명 대신 별명도 괜찮아요.' : '주민번호·카드번호 등은 적지 마세요.'}
    </p>
  )
}
