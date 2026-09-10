<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 똑똑 (Ttokttok)

숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 모바일 웹 서비스.
Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Supabase. 라이트 기본(다크·시스템 선택 가능), 모바일 우선(최대 480px 프레임), 한국어 단일.

## 필수 선행 독서 — 작업 유형별

코드를 쓰기 전에, 작업이 아래 유형에 해당하면 해당 문서를 **먼저 읽는다**. 읽지 않고 추측으로 진행하지 않는다.

| 작업 유형 | 먼저 읽을 문서 |
|---|---|
| 화면·컴포넌트·훅 등 **프론트 작업 전부** | [FRONTEND.md](./docs/FRONTEND.md) + [DESIGN.md](./docs/DESIGN.md) |
| 색·타이포·간격·라운딩 등 **스타일 판단** | [DESIGN.md](./docs/DESIGN.md) |
| DB 스키마·RLS·RPC 변경 | [prd-ttokttok.md](./docs/prd-ttokttok.md) §6 + `supabase/migrations/` 기존 파일 |
| 기능 범위·동작 판단 (뭘 만들지/안 만들지) | [prd-ttokttok.md](./docs/prd-ttokttok.md) — 결정 기록은 §11 |

## 불변 규칙 (요약 — 상세는 각 문서)

- 스타일: 시맨틱 토큰만 (`bg-background`). 원시 hex·px·Tailwind 팔레트 직접 참조 금지. 토큰 추가는 `packages/ui/src/theme.css` + DESIGN.md 동시 수정.
- 상태: 서버 상태=TanStack Query / UI 상태=useState / URL 상태=searchParams. 전역 스토어 도입 금지.
- 데이터: 보안은 RLS가 담당. service role 키는 서버 전용. 카운터는 트리거·RPC로만 증감.
- MVP 비목표 (만들지 말 것): UGC, 결제, ML 개인화, 포인트·레벨류 게이미피케이션, 다국어, PWA.

## 완료 기준

- `npm run build` 통과 (타입체크 포함).
- 화면 작업은 375px 뷰포트에서 실제 렌더 확인.
- 규칙·토큰·스키마를 바꿨다면 해당 가이드 문서를 같은 커밋에서 갱신 — 문서와 코드가 어긋난 채 커밋하지 않는다.

## 문서 지도

| 문서 | 역할 |
|---|---|
| [prd-ttokttok.md](./docs/prd-ttokttok.md) | 제품 요구사항 — 기능 명세, 데이터 모델, 로드맵, 결정 기록 |
| [DESIGN.md](./docs/DESIGN.md) | 디자인 시스템 — 토큰(YAML) + 사용 규칙. 토큰 원천은 `packages/ui/src/theme.css` |
| [FRONTEND.md](./docs/FRONTEND.md) | 프론트 구조 규칙 — 디렉터리, 컴포넌트, 상태, 데이터 접근, 성능, 완료 기준 |
| `supabase/migrations/` | DB의 진실 — 스키마·RLS·RPC는 마이그레이션 파일로만 변경 |

## 모노레포 경계

- `apps/client`(:3000)와 `apps/admin`(:3001)은 서로 import하지 않는다.
- `packages/shared`는 React·Next·DOM·네트워크에 의존하지 않는다. 공용 UI는 `packages/ui`, DB 팩토리·생성 타입은 `packages/database`, 외부 콘텐츠 수집은 `packages/content`에 둔다.
- 앱은 자신의 인증·데이터 로직을 소유하며 공용 화면에 동작을 조합한다. 관리자 미리보기는 저장·집계를 실행하지 않는다.
- 앱 분리·인증·공용 UI 변경 시 두 앱의 E2E·실제 로컬 DB 인테그레이션·디자인 회귀를 모두 실행한다. [검증 절차](./docs/monorepo-testing.md)와 [배포 영향](./docs/monorepo-deployment.md)을 따른다.
