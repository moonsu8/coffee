# 익명 로그인 CAPTCHA (Cloudflare Turnstile) 설정 순서

목적: 초대 코드를 입력할 때 만들어지는 **익명 계정**을 봇이 대량으로 만드는 것을 막는다(익명 로그인은 IP당 시간당 30회 제한 + DB 크기를 늘린다).

## 규칙 (중요)
- **운영 프로젝트에서만 켠다.** 테스트 프로젝트(`coffee-test`)는 CAPTCHA를 **끈 채로** 둔다. `npm run test:rls`가 익명 로그인을 CAPTCHA 없이 만들기 때문이다.
- 서버에서 CAPTCHA를 켜면 앱도 사이트 키(`VITE_TURNSTILE_SITE_KEY`)를 넣어 빌드해야 한다. **둘은 항상 같이 켠다.** (서버만 켜면 참여가 막히고, 앱만 켜면 쓸데없는 위젯이 뜬다.)
- **시크릿 키는 Supabase 대시보드에만 입력한다.** 저장소·`.env*`·채팅 어디에도 적지 않는다. 사이트 키는 공개 값이라 빌드에 들어가도 된다.
- 운영 환경 변수 규칙: CAPTCHA를 켜기 전에는 운영 Supabase 값을 배포 설정에 넣지 않는다(CLAUDE.md). 순서는 아래 4번 뒤에 운영 값을 넣는다.

## 순서 (직접 하는 일)
1. Cloudflare 대시보드 > Turnstile > **사이트 추가**. 위젯 모드는 Managed(권장), 호스트 이름에 앱 도메인을 넣는다(도메인이 정해진 뒤. `localhost`는 개발용으로 추가 가능). 만들면 **사이트 키(공개)**와 **시크릿 키(비공개)**가 나온다.
2. Supabase **운영 프로젝트** 대시보드 > Authentication > (Project Settings의) **Bot and Abuse Protection** > "Enable CAPTCHA protection" 켜기 > 제공자 **Cloudflare Turnstile** 선택 > **시크릿 키** 입력 > Save.
3. 앱 빌드에 사이트 키를 넣는다: 운영 빌드의 `VITE_TURNSTILE_SITE_KEY`(GitHub Actions 변수 등 공개 값). 로컬 `.env.local`은 테스트 프로젝트를 쓰므로 비워 둔다.
4. **직접 확인(운영 프로젝트에 연결한 창):** 로그아웃 상태에서 설정 > 공유 그룹 > 초대 코드로 참여 > 시트에 사람 확인 위젯이 보이고, 통과해야 [참여하기]가 켜진다. 통과 뒤 참여가 되면 성공. 위젯 없이 참여하는 요청이 서버에서 거절되는지도 한 번 확인한다(위젯이 없는 옛 빌드로 시도).

## 알아 둘 점 (공식 문서 확인, 2026-11-22)
- Supabase는 **hCaptcha와 Cloudflare Turnstile**을 지원한다. 토큰은 인증 호출의 `options.captchaToken`으로 보낸다. 앱은 `signInAnonymously`에 이 토큰을 넣는다.
- **[확인 필요]** 문서의 예시는 `signUp`뿐이고 **익명 로그인(`signInAnonymously`)과 OAuth(Google) 로그인이 CAPTCHA 보호 대상인지는 문서에 적혀 있지 않다.** 운영 프로젝트에서 켠 뒤 4번의 "토큰 없이 시도하면 거절되는지"로 실제 동작을 확인한다. 거절되지 않는다면 CAPTCHA가 익명 로그인을 막지 못하는 것이므로, 다른 방어(IP 제한 하향, 익명 사용자 정리)를 대안으로 정한다.
- Google 로그인은 앱에서 CAPTCHA를 요구하지 않는다(그룹장은 Google 계정으로 로그인).
- Cloudflare 테스트 키(어느 도메인에서나 동작): 사이트 키 `1x00000000000000000000AA`(항상 통과) / 시크릿 키 `1x0000000000000000000000000000000AA`(항상 통과). 시크릿과 사이트 키는 짝이 맞아야 한다. 테스트 프로젝트에서 CAPTCHA 동작만 시험해 보고 싶을 때 쓰되, `test:rls`를 돌릴 때는 다시 끈다.
- 위젯 스크립트(`challenges.cloudflare.com`)는 **사이트 키가 있는 빌드에서 참여 시트를 열 때만** 불러온다.
