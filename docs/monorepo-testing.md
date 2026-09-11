# 분리 후 검증

## 재현

Node.js 22.18 이상, Docker Desktop, FFmpeg가 필요하다. Windows와 Chromium을 기준으로 디자인 이미지를 확보했다. 다른 OS의 글꼴 렌더링 차이는 동일 OS에서 다시 확인한다.

```bash
npm ci
npx playwright install chromium
npm run test:db
npm run test:seed
npm run test:build
npm test
npm run typecheck
npm run test:e2e
npm run test:seed
npm run test:visual
```

`test:db`는 기존 개발 DB와 다른 `ttokttok-e2e` 프로젝트·포트(54421)·볼륨을 만든다. 저장소의 모든 마이그레이션을 적용하며 운영 DB에는 연결하지 않는다. 생성된 `.env.test`는 Git에서 제외하고 테스트는 정확히 이 로컬 주소만 허용한다. 테스트 데이터 초기화는 예약된 테스트 ID와 테스트 계정의 기록에만 적용한다. 기존 `ttokttok` 로컬 DB도 초기화하지 않는다.

E2E·화면 비교는 두 프로덕션 빌드를 **client 3003 · admin 3004**에서 자동 시작한다 — 포트의 단일 출처는 `.env.test`의 `CLIENT_URL`/`ADMIN_URL`(`scripts/test-db.mjs`가 쓴다)이다. 개발 서버(3000·3001)와 일부러 겹치지 않게 두었으므로 개발 서버를 끌 필요가 없다. 겹치면 `reuseExistingServer`가 운영 Supabase에 붙은 개발 서버를 그대로 재사용해 테스트가 운영 DB에 쓰게 된다. 다른 환경으로 빌드한 서버를 재사용하지 않는다. 실제 DB 인테그레이션은 실행 중인 client의 전자책 응답도 확인하므로 다음처럼 서버를 띄운 뒤 다른 터미널에서 실행한다.

```bash
node scripts/serve-test.mjs client
# 다른 터미널
npm run test:integration
```

`npm run db:types`는 동일한 로컬 마이그레이션에서 `packages/database/src/types.ts`를 재생성한다. 테스트 종료 후 `node scripts/test-db.mjs --stop`은 테스트 컨테이너를 종료하며 데이터는 보존한다.

## 검증 범위

- client E2E: 피드·검색·채널·도서 시트·로그인 안내·테마·좋아요·댓글·찜·프로필·영상 실제 재생·전자책 실제 본문·읽기 기록·예전 관리자 주소 연결.
- admin E2E: 로그인·권한 차단·로그아웃·양쪽 세션 독립·관리 화면들·편집 미리보기·발행/비공개 전환·채널 생성/수정/삭제·EPUB/표지 업로드와 사용자 읽기·추천 노출·신고 처리.
- client 인테그레이션: 게시물 공개 범위, 실제 피드 RPC 페이지 경계, 개인 기록 접근 정책, 비공개 EPUB과 서명 주소.
- admin 인테그레이션: 일반 사용자의 권한 상승·작성 차단, 실제 도서 CRUD와 별도 사용자 접속의 조회, 저장소 권한.
- 공통: 두 앱 타입 검사·빌드, 기존 280개 테스트, 안전한 관리자 복귀 주소 및 패키지 의존 경계 검사.

## 디자인 기준과 진단

기준 이미지는 분리 후 화면이 아니라 `.tmp/monorepo-baseline`에 보존한 **분리 전 소스**를 별도로 빌드해 포트 3100에서 캡처했다. 최초 커밋 `2e0c6b5`에 사용자가 작업 중이던 소개 화면 변경까지 포함한다. `e2e/baselines`에 보존한다. 같은 DB 픽스처, 브라우저, 언어, 시간대, 화면 크기에서 비교하며 실패를 없애려고 분리 후 화면으로 기준을 덮어쓰면 안 된다.

사용자 13개 화면(375px 및 1440px 홈·다크·시트·소개·독서 포함)과 관리자 11개 화면(목록·등록/수정 폼·두 카드 템플릿)을 비교한다. 허용치는 전체 픽셀의 0.1%이며 실제 차이가 발생하면 결과 이미지와 원인을 검토한다. 테스트 보고서는 `playwright-report/index.html`, 실패 화면·추적 기록은 `test-results`에 생성된다.

Chromium 153이 EPUB의 스크립트 금지 프레임에 대해 출력하는 `about:srcdoc` 차단 메시지는 분리 전 앱에서도 같은 문구로 재현했다. 뷰어의 보안 설정을 완화하지 않고, 해당 경로의 정확히 일치하는 메시지만 알려진 진단으로 구별한다. 실제 EPUB 본문과 읽기 기록 저장은 별도로 검증한다. 예상한 HTTP 거부 응답도 해당 테스트에서 상태를 확인한다.

외부 Google/Kakao의 계정 선택·동의 완료, 외부 위키문헌 서버의 가용성, 실제 운영 Vercel 도메인·프로젝트 설정은 로컬 테스트로 증명하지 않는다. 사용자 인증 이후의 동작은 실제 로컬 Supabase 세션으로 검증한다.

## 결과

최종 실행 결과와 운영 전환 전 남은 확인 사항은 [분리 결과 보고서](./monorepo-verification-report.md)에 기록한다.
