# 영상 재생 컨트롤 통합 · 유튜브 크롬 제거

작성일 2026-09-02 · 상태: 승인 대기 · 관련: PRD §5.3, `2026-09-01-home-feed-overlay-design.md`

## 문제

유튜브 임베드가 **자기 UI를 우리 화면 위에 그린다.** 상단에 제목·채널 바, 하단에 "동영상 더보기"·YouTube 로고 바, 가운데에 재생 컨트롤이 뜬다. 우리 크롬(액션 레일, 도서 정보 바)과 겹쳐서 남의 서비스가 우리 피드에 얹힌 것처럼 보인다.

두 번째 문제는 **조작이 유형마다 다르다는 것**이다. mp4 게시물에는 음소거 버튼이 있고 유튜브 게시물에는 아무 조작도 없다. 같은 피드에서 게시물마다 되는 게 다르다.

## 실측으로 확인한 것

추측이 여러 번 틀렸으므로 확인된 사실만 적는다 (2026-09-02, Chrome, 480px 프레임).

| 확인 | 결과 |
|---|---|
| `controls=0` · `modestbranding=1` | 크롬을 막지 못한다 |
| iframe에 `pointer-events: none` | **부족하다.** 크로스 오리진 iframe은 별도 프로세스라 브라우저가 히트 테스트를 건너뛰고 포인터 이벤트를 그대로 넘기는 경로가 있다 |
| 우리 문서 안에서 iframe을 덮는 층 | 포인터를 막는다 (`elementFromPoint`가 우리 층을 반환) |
| iframe을 위아래로 키워 잘라내기 | 상·하단 띠가 시작 순간에도 안 보인다 |
| `playlist=` 제거 | 가운데 ⏮ ⏭ 가 사라진다. ⏸ 하나만 1~2초 남는다 |
| 영상 우상단 주황색 ↺ | 파라미터와 무관하게 남고 위치가 영상 프레임 기준 — **영상에 박힌 워터마크**이지 유튜브 UI가 아니다 |
| 루프 재시작 | 돌 때마다 크롬이 다시 뜬다 (사용자 확인) |
| iframe은 replaced 요소 | `top`·`bottom`만 주면 안 늘어나고 기본 150px로 돌아간다 — 높이를 직접 줘야 한다 |

**검증 환경 주의:** 브라우저 패널이 화면에서 가려지면 페이지가 합성을 멈춘다. IntersectionObserver가 안 돌아 영상이 마운트되지 않고, 마운트돼도 크롬이 iframe 재생을 1.5초 안에 멈춘다(`playVideo()`를 불러도 `paused`로 떨어진다). 영상 동작은 **반드시 패널이 보이는 상태에서** 확인한다.

## 설계

### 구조

```
src/components/feed/
  video-player.tsx        소스 분기 + 뷰포트 판정만
  upload-video.tsx        <video> 제어
  youtube-video.tsx       유튜브 IFrame API 제어 + 시작 마스크
  video-chrome.tsx        공통 컨트롤 UI
  use-youtube-player.ts   API 스크립트 로드 + 플레이어 수명주기
```

훅은 조건부로 호출할 수 없으므로 소스별 컴포넌트를 나눈다. 훅은 피드 전용이라 `src/hooks/`로 올리지 않는다 (FRONTEND.md §1 — 미리 일반화하지 않는다).

두 재생기는 같은 값을 만들어 `VideoChrome` 하나에 넘긴다:

```ts
type VideoControls = {
  playing: boolean;
  muted: boolean;
  togglePlay: () => void;
  toggleMute: () => void;
};
```

`VideoChrome`은 이 넷만 받는다. 소스가 무엇인지 모르므로 두 유형의 조작이 어긋날 수 없다. 유튜브 특유의 처리(스크립트 로드, 상태 이벤트, 루프 되감기, 마스크)는 전부 `youtube-video.tsx` 안에 갇힌다.

### 컨트롤 UI (`video-chrome.tsx`)

| 요소 | 규칙 |
|---|---|
| 탭 레이어 | `<button className="absolute inset-0">`, `aria-label`은 상태 따라 "일시정지"/"재생" |
| 가운데 ▶ | `playing === false`일 때만. `pointer-events-none` — 탭을 뺏지 않는다 |
| 음소거 버튼 | 지금 마크업·위치(우측 상단 `size-11`, `bg-black/50`) 그대로. mp4·유튜브 공용 |

탭 레이어가 **유튜브로 가는 포인터를 삼키는 역할을 겸한다.** 지금 따로 둔 투명 오버레이는 제거한다 — 한 층이 두 일을 한다.

z 계층 (게시물 컨텍스트 기준, `post-item.tsx` 주석 참조):

- iframe·video, 마스크, 탭 레이어 → z 없음(본문층). 위치를 가진 형제라 DOM 순서대로 쌓인다
- 가운데 ▶, 음소거 버튼 → `z-[3]` (스크림 위)

마스크와 가운데 표시는 `pointer-events-none`이라 탭 레이어가 항상 포인터를 받는다.

### 유튜브 크롬을 없애는 세 겹

| 겹 | 막는 대상 | 방법 |
|---|---|---|
| 크롭 | 상단 제목·채널 바, 하단 "동영상 더보기"·로고 | `absolute -top-30 h-[calc(100%+240px)]` — 띠가 그려지는 자리를 article의 `overflow-hidden` 밖으로 민다. 플레이어는 영상을 iframe 중앙에 맞추므로 세로로만 키우고 같은 양을 위로 당기면 영상 위치·크기가 안 변한다 |
| 파라미터 | ⏮ ⏭ | `playlist=` 제거. 루프는 API가 맡는다 |
| 마스크 | 시작 직후 ⏸ | 유튜브 썸네일을 덮었다가 플레이어가 **처음** `PLAYING`에 들어간 시점부터 `YT_CHROME_FADE_MS`(1500ms) 뒤 페이드아웃 |

마스크가 덮여 있는 동안에도 컨트롤은 살아 있다 — 탭하면 멈추고, 그 경우 마스크는 그대로 걷힌다(타이머는 재생 상태와 무관하게 한 번만 돈다).

썸네일은 `https://i.ytimg.com/vi/<id>/hqdefault.jpg` — `maxresdefault`는 없는 영상이 있어 깨진다. `next/image`를 쓰므로 `next.config.ts` `remotePatterns`에 `i.ytimg.com`을 추가한다 (FRONTEND.md §6). 영상이 레터박스로 들어가므로 마스크도 `bg-black` + `object-contain`으로 같은 모양을 만든다.

### 루프

`ENDED` 상태로 보내지 않는다 — 종료 화면과 크롬이 거기서 나온다. 재생 중 250ms 간격으로 `getCurrentTime()`을 보고 `duration - 0.25s`를 넘으면 `seekTo(0, true)`. 폴링은 재생 중에만 돈다.

`ENDED`가 오더라도(폴링이 늦은 경우) 같은 처리를 한다 — 안전망이다.

### 뷰포트 이탈

지금은 화면 밖이면 iframe을 떼어 재생을 멈춘다. API가 생기면 `pauseVideo()`로 바꾼다. 되돌아왔을 때 초기화도 마스크도 없이 이어진다 — 마스크는 플레이어 생성 직후 한 번만 쓴다.

스크롤 창(앞뒤 2~3개) 밖으로 나가면 FeedScroller가 슬롯을 비우므로 컴포넌트가 언마운트되고, 그때 `player.destroy()`로 정리한다.

`<video>` 쪽은 지금 동작(`play()`/`pause()`)을 그대로 둔다.

### API 스크립트가 막히면

`https://www.youtube.com/iframe_api`는 광고 차단기에 막힐 수 있다. 로드 실패(또는 8초 타임아웃) 시 지금 방식 — 파라미터 임베드(`autoplay`·`mute`·`loop`·`playlist`) + 크롭 — 으로 폴백하고 컨트롤은 숨긴다. 크롬이 조금 보이더라도 영상이 아예 안 나오는 것보다 낫다.

### 문서 갱신

- PRD §5.3 — "탭으로 음소거 해제"를 새 규약으로 교체: 탭은 일시정지/재개, 음소거는 버튼, 유튜브도 같은 컨트롤
- PRD §11 — 결정 기록 한 줄 (유튜브 자체 UI를 쓰지 않고 우리 컨트롤로 통일한 이유)

DESIGN.md는 손대지 않는다 — 새 토큰 없이 기존 크롬 처방(흰색 한 벌, `bg-black/50` 원형 버튼)을 그대로 쓴다.

## 범위

- `src/components/feed/video-player.tsx` — 분기·IO만 남기고 재생 로직 이관
- `src/components/feed/upload-video.tsx` (신규)
- `src/components/feed/youtube-video.tsx` (신규)
- `src/components/feed/video-chrome.tsx` (신규)
- `src/components/feed/use-youtube-player.ts` (신규)
- `src/lib/youtube.ts` — 썸네일 URL 헬퍼 추가, 임베드 URL은 폴백 전용으로 유지
- `next.config.ts` — `i.ytimg.com` remotePattern
- `docs/prd-ttokttok.md` §5.3, §11

## 검증 기준

**패널이 화면에 보이는 상태에서**, 375px 뷰포트로 확인한다.

- 유튜브 게시물 진입 시 제목 바·"동영상 더보기" 바·⏮⏸⏭ 가 한 번도 보이지 않는다
- 16초 지점(루프)에서 크롬이 뜨지 않고 영상이 처음으로 돌아간다
- 화면을 탭하면 멈추고 가운데 ▶ 가 뜬다. 다시 탭하면 재개하고 ▶ 가 사라진다
- 음소거 버튼이 유튜브 게시물에서도 소리를 켜고 끈다
- mp4 게시물에서 위 두 조작이 똑같이 동작한다
- 다음 게시물로 스크롤하면 재생이 멈추고, 돌아오면 마스크 없이 즉시 이어진다
- 탭 레이어가 포인터를 삼켜 마우스를 올려도 유튜브 크롬이 안 뜬다
- 액션 레일·도서 바·읽기 버튼은 여전히 눌린다 (탭 레이어가 가로채지 않는다)
- `npm run build` 통과

## 알려진 한계

- **첫 1.5초는 썸네일이 덮는다.** 마스크가 걷힐 때 되감지 않으므로 영상은 1.5초 지점부터 보인다. 되감기(`seekTo(0)`)가 글리프를 다시 띄우는지 확인하지 못했다 — 루프 되감기에서 글리프가 안 뜨는 것이 확인되면 그때 재검토한다.
- **영상에 박힌 워터마크는 못 지운다.** 우상단 주황색 ↺ 같은 것은 영상 픽셀이다.
- 유튜브가 임베드 UI를 바꾸면 크롭 값(120px)이 어긋날 수 있다. 띠가 다시 보이면 그 값을 조정한다.
- `pointer-events: none`으로 크로스 오리진 iframe의 이벤트가 막히는지는 브라우저·버전에 따라 다르다. 이 설계는 그것에 기대지 않고 우리 층으로 막는다.
