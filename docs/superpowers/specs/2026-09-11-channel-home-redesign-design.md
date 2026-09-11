# 채널 홈 재구성 — 커버 히어로 + 정방형 타일 + 홈 카드 상세

작성일 2026-09-11 · 상태: 승인 (구현 진행)

## 문제

채널 페이지(`/channel/[slug]`, PRD §5.9)는 지금 "뒤로가기 → 아바타 + 이름 +
장르 칩 → 소개 → 도서 표지(2:3) 그리드"를 한 상자에 쌓은 목록 화면이다.
사용자가 준 참고 화면(메신저 앱의 프로필 홈)은 구성이 다르다.

1. **풀블리드 커버 사진**이 화면 위 60%를 차지하고, 그 위에 뒤로가기·이름·
   아바타·액션 바가 얹힌다.
2. 그 아래 **정방형 사진 타일이 빈틈없이 이어지는 3열 모자이크**.
3. 타일을 누르면 **전면 상세**로 간다 — 우측 레일(좋아요·댓글), 좌하단
   작성자.

세 번째는 이미 있다. 영상 타일은 채널 스코프 릴스 뷰어(§11-58)로 가고 그
화면이 참고 이미지 2와 같은 전면 구조다. 문제는 **카드 타일**이다. 지금
`/p/[postId]`는 전면 뷰어용 `PostItem`을 그린다 — 홈이 전면 피드였던 시절
(§11-47 이전)의 흔적이고, 홈이 카드 피드로 바뀐 뒤(§11-48·53) 카드 게시물의
정식 모양은 홈 카드(`PostCard`)가 됐다. 공유 링크로 들어온 사람이 공유한
사람과 다른 모양을 보는 상태다.

## 확정 사항 (사용자 답변)

| 질문 | 답 |
|---|---|
| 카드 상세 위치 | **`/p/[postId]` 자체를 바꾼다** — 카드면 홈 카드, 영상이면 지금의 `PostItem` |
| 커버 이미지 출처 | **`channels.cover_url` 컬럼 추가** + 어드민 폼 입력. 없으면 아바타 블러 폴백 |
| 그리드 타일 | **게시물 썸네일 1:1** — 카드는 배경 + 훅 문구, 영상은 포스터 + 재생 글리프 |
| 액션 바 | **"영상 이어보기 \| 채널 공유"** — 팔로우는 v2 보류(PRD §10)라 제외 |

참고 화면의 요소 중 옮기지 않는 것: D+ 카운터(개인 위젯, 대응 없음 → 장르
칩 + 게시물 수로 대체), "프로필 편집"(사용자는 편집 권한 없음), ⋮ 메뉴
(동작이 공유 하나뿐이라 메뉴가 한 단계를 더한다), "친구에게만 공개" 잠금
문구(채널 게시물은 전부 공개).

## 1. 채널 홈 — 구조

```
ChannelPage (RSC, h-full overflow-y-auto)
├─ ChannelHero (RSC)            components/channel/channel-hero.tsx
│   ├─ 배경: cover_url → 아바타 블러 → --post-navy
│   ├─ 스크림 (하단 60%, 검정 0.7 → 투명)
│   ├─ 상단 바: 뒤로가기 (원형 bg-black/50)
│   └─ 하단 블록: 아바타 → 채널명 → 장르 칩 + 게시물 N → 소개 → ChannelActions
│       └─ ChannelActions (RSC)  components/channel/channel-actions.tsx
│           ├─ Link "영상 이어보기" → /channel/[slug]/reels   (영상 0건이면 숨김)
│           └─ ChannelShareButton (client leaf)  "채널 공유"
└─ ChannelGrid (RSC)            components/channel/channel-grid.tsx
    └─ PostTile × N             components/channel/post-tile.tsx
        └─ resolvePostThumbnail  packages/shared/src/post-thumbnail.ts (순수)
```

데이터 계층은 `getChannel`(select에 `cover_url` 추가)·`getChannelPosts`를
그대로 쓰고, `getChannelCounts(channelId)`를 하나 더한다.

### 1.1 히어로

- **상자**: 풀블리드, `aspect-[3/4]`를 **하한**으로 둔다 — CSS `aspect-ratio`는
  선호 크기라 소개가 길면 상자가 더 자란다(css-sizing-4 자동 최소 크기).
  375px에서 약 500px로 참고 화면의 커버 비중과 같다.
- **배경 세 단계**: `cover_url`이 있으면 `next/image` `fill`
  (`sizes="(max-width: 480px) 100vw, 480px"`, `priority`, `object-cover`).
  없으면 아바타 이미지를 `fill` + `blur-2xl scale-110`으로 깐다. 그것도 없으면
  단색. **어느 경우든 맨 밑에 `--post-navy` 바탕이 깔린다** — 이미지가 404여도
  흰 글자 대비가 유지된다.
- **스크림**: 하단 60% 높이, 검정 0.7에서 투명으로 전 구간 단조 감소. 피드
  하단 스크림(DESIGN.md Colors)과 같은 성격이다. 상단 스크림은 없다 — 뒤로가기
  버튼이 자기 `bg-black/50` 원을 갖는다(음소거 버튼 선례).
- **상단 바**: 좌측 뒤로가기 `Link href="/"` `aria-label="피드로 돌아가기"`,
  `size-11` 원형. 우측은 비운다.
- **하단 블록** (`absolute inset-x-0 bottom-0`, 패딩 `md`, 세로 간격 `sm`~`md`,
  좌측 정렬):
  1. `Avatar size-20` + `border-2 border-white/80`. 폴백은 이름 첫 글자.
  2. 채널명 — titleScreen(24px/700), `text-white break-keep feed-chrome-text`.
  3. 메타 한 줄 — 장르 칩(`rounded-full border border-white/40 text-white`
     caption) + `게시물 N` (`text-white/90` caption). 카운트 실패면 `게시물 –`.
  4. 소개 — bodySmall `text-white/90 line-clamp-2 break-keep`. 없으면 생략.
  5. 액션 바 (1.2).
- **게시물 N·영상 유무는 정확한 수**다. 그리드에 실린 최대 30건(§11-58의
  캡)으로 세면 30건 넘는 채널에서 틀린다. `getChannelCounts`가
  `posts`에 `count: "exact", head: true` 두 번(전체·영상)을 병렬로 던져
  `{ total, videos, failed }`를 돌려준다. 실패 규약은 §11-61 그대로.

### 1.2 액션 바

- 한 필: `flex rounded-full border border-white/40 bg-black/30 backdrop-blur-sm`.
  칸은 `flex-1 min-h-11 text-white text-sm font-medium`, 사이에 `w-px bg-white/40`
  구분선(세로 여백 `sm`).
- 왼쪽 **"영상 이어보기"** (lucide `Play`): `Link` → `/channel/[slug]/reels`.
  `start` 없이 첫 영상부터. **영상이 0건이거나 카운트를 못 읽었으면 칸을
  숨긴다** — 그 링크를 살려두면 뷰어가 `notFound()`로 가는 막다른 길이 된다.
  숨기면 필에 공유 한 칸만 남는다.
- 오른쪽 **"채널 공유"** (lucide `Share2`): 클라이언트 leaf
  `ChannelShareButton`. `navigator.share({ title: 채널명, url })` → 없거나
  거절되면 클립보드 복사 + 토스트 "링크를 복사했어요"(`CardActions`의
  handleShare와 같은 순서). 카운터는 올리지 않는다 — `share_count`는 게시물
  단위다.

### 1.3 그리드

- `ul grid grid-cols-3 gap-1`, 좌우 여백 없음(풀블리드), 하단 `pb-4`. 타일
  라운딩 없음 — 모자이크다.
- **렌더 불가 카드는 건너뛴다**: `isRenderableCard(post.post_cards)`가 false인
  카드 게시물은 타일을 만들지 않는다. 지금은 타일이 보이는데 누르면
  `/p/[postId]`가 404다.
- **조회수는 그리드에서 뺀다.** 타일 밑에 글자가 붙으면 모자이크가 깨지고,
  수치는 상세(액션 줄)에서 본다.
- 목적지는 §11-58 그대로: 영상 → `/channel/[slug]/reels?start=<id>`, 카드 →
  `/p/<id>`.
- 빈 목록 `아직 발행한 게시물이 없어요.` / 실패 `게시물을 불러오지 못했어요.
  잠시 후 다시 시도해 주세요.` 문구는 지금 것을 유지한다. 필터로 전부
  걸러진 경우도 "없어요"로 말한다.

#### 타일 결정은 순수 함수

`packages/shared/src/post-thumbnail.ts`의 `resolvePostThumbnail(post)`:

```ts
type PostThumbnail =
  | { kind: "image"; src: string; x: number; y: number; dim: number;
      ink: "light" | "dark"; text: string | null; video: boolean }
  | { kind: "solid"; color: string | null;               // null → --post-paper
      ink: "light" | "dark"; text: string | null; video: boolean };
// video=true는 영상 게시물이라는 뜻이고 재생 글리프를 그린다 — 포스터 없는
// 옛 업로드가 solid로 떨어져도 글리프는 남아야 하므로 두 변형 모두 갖는다.
```

| 입력 | 결과 |
|---|---|
| 카드, 배경 `image` + imageUrl | `image`, 저장된 x·y·dim, ink=배경 text, text=훅 |
| 카드, 배경 `solid` | `solid`, color(null이면 종이색), ink, text=훅 |
| 카드, 배경 NULL/깨짐 | `resolveCardBackground`의 기본값 → `solid` 종이색·dark |
| 영상 upload, poster_path 있음 | `image` src=poster_path, dim 0, video=true, text=null |
| 영상 youtube | `image` src=`https://i.ytimg.com/vi/<id>/hqdefault.jpg`, video=true |
| 영상 upload, poster_path 없음 | 도서 `cover_url`이 있으면 `image`(정방형 크롭), 없으면 `solid` 종이색 + 도서 제목을 text로 |

`poster_path`는 `save_video_post`가 `public_base || '/poster.jpg'`로 저장하는
**완전한 URL**이라 해석이 필요 없다. `i.ytimg.com/vi/**`와 Storage 공개
버킷은 `next.config.ts` remotePatterns에 이미 있다.

#### PostTile 렌더

- `Link` `relative block aspect-square overflow-hidden`, `aria-label`
  `"<도서 제목> <카드|영상> 게시물"`.
- `image`: `next/image fill sizes="(max-width: 480px) 33vw, 160px" object-cover`,
  `objectPosition: x% y%`; 위에 `card-background-dim`과 같은 어둡기 층
  (opacity dim/100). 영상은 dim 0이라 층이 투명.
- `solid`: `style={{ backgroundColor: color ?? "var(--post-paper)" }}`.
- 훅 문구: 좌하단 `p-2`, `text-xs font-bold leading-snug line-clamp-3
  break-keep`, 색은 ink에 따라 `var(--post-ink-light|dark)`. 12px은
  DESIGN.md 캡션 하한이다.
- 영상 글리프: 우상단 `size-7 rounded-full bg-black/50 text-white` 안에
  lucide `Play` `size-4` (음소거 버튼과 같은 외피).

## 2. 게시물 상세 (`/p/[postId]`)

- **유형 분기**: `post.type === "cards"`면 새 레이아웃, 영상이면 지금의
  `PostItem` 그대로.
- **카드 레이아웃**:
  ```
  div.flex.h-full.flex-col
  ├─ header.h-14.flex.items-center.px-2   ← 홈 TopBar와 같은 56px
  │   └─ Link href=/channel/<slug>  aria-label="채널로 돌아가기"  (ChevronLeft, size-11)
  └─ div.flex-1.min-h-0.overflow-y-auto
      └─ div[CARD_SCROLL_ITEM]              ← 홈과 같은 하한(min(85%, 720px))
          └─ PostCard post liked isGuest userId pinnedCommentId
  ```
  `CARD_SCROLL_ITEM`은 `card-metrics.ts`의 홈 카드 하한 클래스다. 여기서도
  써서 홈에서 본 카드와 같은 크기로 보이게 한다 — 상한이 아니라 하한이므로
  긴 카드는 스크롤된다(DESIGN.md Layout의 카드 높이 규칙).
- **뒤로가기는 그 게시물의 채널 홈으로 고정**한다. 채널 그리드에서 들어온
  주 흐름에 맞고, 공유 링크로 들어온 사람에게도 이어 볼 곳이 된다.
  `history.back()`·referrer 추측은 쓰지 않는다 — 서버 `Link` 하나로 끝나고
  결과가 예측 가능하다.
- **댓글 딥링크**: `pinnedCommentId?: string`을 `PostCard` → `CardActions` →
  `CommentSheet`로 이어 붙인다. `CommentSheet`는 이미 이 prop을 받아 시트를
  열고 문맥을 조회한다. 홈은 넘기지 않는다(undefined).
- **바뀌지 않는 것**: `generateMetadata`(OG), 렌더 불가 카드 404, 조회
  집계(`record_view`는 `CardFeed`·`FeedScroller`가 호출한다 — 상세는 지금도
  집계하지 않고 앞으로도 그대로다).

## 3. DB · 어드민 · 문서

- **마이그레이션** `supabase/migrations/20260912000001_channel_cover.sql`:
  `alter table public.channels add column cover_url text;` RLS는 공개 read가
  이미 있어 손대지 않는다. 대시보드로 운영에 적용했다면 곧바로
  `supabase migration repair`로 원장을 맞춘다(memory: migration-ledger).
- `packages/database/src/types.ts` channels Row/Insert/Update에
  `cover_url: string | null`.
- `apps/client/src/lib/channel.ts` select에 `cover_url`.
- **어드민** `channels/page.tsx`에 "커버 이미지 URL" `Input`(아바타 URL 아래),
  `actions.ts` `readForm`에 `cover_url: … || null`.
- **시드** `scripts/seed-test.mjs`의 `test-walk` 채널에 `cover_url`을 넣어
  시각 회귀가 주 경로(사진 커버)를 찍게 한다. 폴백 경로(아바타 블러·단색)는
  단위 테스트가 아니라 375px 수동 렌더로 확인한다.
- **문서 (같은 커밋)**:
  - PRD §5.9: 채널 = 이름 + 아바타 + **커버** + 장르 + 소개. 채널 홈 구성
    (히어로·액션 바·1:1 타일). 카드 타일 → `/p/[postId]`는 **홈 카드**를 그린다.
  - PRD §6 channels 행에 `cover_url text`.
  - PRD §11 결정 기록 한 행(아래 초안).
  - DESIGN.md Colors 면제 목록에 **채널 히어로 크롬**과 **영상 타일 재생
    글리프** 추가 + 히어로 스크림 규격(하단 60%, 0.7 → 0).
  - FRONTEND.md는 규칙 변경이 없어 건드리지 않는다.

### 결정 기록 초안 (§11)

> | N | 채널 홈 재구성 · 카드 상세를 홈 카드로 | 채널 페이지를 "커버 히어로 + 정방형 타일 모자이크"로 바꾸고(2026-09-11, 설계 `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md`), 카드 타일이 가는 `/p/[postId]`가 전면 뷰어용 `PostItem` 대신 **홈 카드(`PostCard`)** 를 그리게 했다. `PostItem` 렌더는 홈이 전면 피드였던 시절의 흔적이라 공유 링크로 들어온 사람이 공유한 사람과 다른 모양을 봤다. 영상은 `PostItem` 그대로다. 커버는 `channels.cover_url`(어드민 URL 입력)이고 없으면 아바타 블러 → `--post-navy` 순으로 폴백해 흰 글자 대비를 보장한다. 타일은 `resolvePostThumbnail`(순수)이 정한다 — 카드는 저장된 배경 + 훅 3줄, 영상은 포스터/유튜브 썸네일 + 재생 글리프, 포스터 없는 옛 업로드는 표지 크롭. **그리드에서 조회수를 뺐다**(모자이크가 깨진다). 액션 바는 "영상 이어보기 \| 채널 공유"이고 팔로우는 v2 보류(§10) 그대로다. 영상 0건·카운트 실패 시 "영상 이어보기"를 숨기는 이유는 채널 릴스 뷰어가 영상 없음을 `notFound()`로 답하기 때문이다. 히어로 위 흰색 고정 크롬과 타일 재생 글리프는 피드 크롬 면제(DESIGN.md Colors)에 명시적으로 추가했다 — 근거는 같다, 밑에 깔리는 것이 임의의 콘텐츠 픽셀이다. |

## 4. 오류 · 빈 상태

| 상황 | 화면 |
|---|---|
| 채널 조회 실패 | `LoadFailed` (지금과 같음) |
| 채널 없음 | `notFound()` |
| 게시물 조회 실패 | 히어로는 그대로, 그리드 자리에 실패 문구 |
| 게시물 0건 (필터 후 포함) | 그리드 자리에 "아직 발행한 게시물이 없어요." |
| 카운트 실패 | "게시물 –", "영상 이어보기" 숨김 |
| 커버 이미지 404 | `--post-navy` 바탕 + 스크림이 남아 글자는 읽힌다 |
| 타일 이미지 404 | `next/image`가 빈 상자를 남긴다 — 훅 문구·글리프는 그대로 보인다 |

## 5. 테스트 · 완료 기준

- **vitest** `packages/shared/src/post-thumbnail.test.ts`: 표의 여섯 행을 각각
  고정한다. 단색 카드 / 이미지 카드(x·y·dim·ink 전달) / 배경 NULL 카드(종이색,
  dark) / 유튜브 영상(썸네일 URL) / 포스터 있는 업로드 / 포스터 없는 업로드
  (표지 → 제목 폴백).
- **e2e 런타임** (`e2e/client.runtime.spec.ts`): 채널 홈에 채널명(h1)·"채널
  공유" 버튼·타일 링크의 목적지(영상은 `/reels?start=`, 카드는 `/p/`). 카드
  상세에 홈 카드 구성(채널 헤더·도서 바)과 채널로 가는 뒤로가기 링크.
- **e2e 시각** (`e2e/client.visual.spec.ts`): `channel-375` 기준선 재생성,
  카드 상세 `post-375` 기준선 추가.
- **실제 로컬 DB 인테그레이션** (`tests/live-db/admin.test.ts`): 채널 저장에서
  `cover_url` 왕복.
- **완료 확인**: `npm run build` · `npm test` · `npm run test:e2e` 통과. playwright로
  375px 채널 홈(커버 있음·없음)과 카드 상세를 라이트·다크 모두 실제 렌더해
  캡처한다(memory: 인앱 스크린샷은 파일로 남지 않는다).

## 범위 밖 (이번에 하지 않음)

- 채널 릴스 뷰어(`/channel/[slug]/reels`)의 뒤로가기 버튼 — 참고 이미지 2에는
  있지만 별개 화면의 변경이라 따로 결정한다.
- 어드민 role 사용자에게 히어로에 "채널 편집" 링크 노출.
- 그리드 페이지네이션(30건 캡, §11-58의 알려진 한계 그대로).
- 커버 이미지 **업로드**(어드민은 URL 입력만, 아바타와 같은 수준).
- 채널 팔로우(PRD §10 v2).
