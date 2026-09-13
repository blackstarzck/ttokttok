# 도서 트레일러 — 설계

2026-09-12 확정. 사용자 요청: "도서등록시 트레일러도 등록할 수 있도록해줘. 밀리의서재에서 도서를 가져올때 response값 한 번 조사해봐. 우리 데이터베이스에 참고할만한 스키마 구조가 있는지 분석도 같이."

브레인스토밍에서 확정한 세 가지: **① 관리자 화면에서 mp4를 고르고 버튼 한 번으로 변환**한다(별도 ZIP 도구 실행 없이), **② 트레일러는 도서당 하나**다, **③ 별도 메뉴 없이 도서 폼 안에서 등록**한다. 사용자 화면 노출은 이번 범위가 아니다.

## 1. 조사 — 밀리의서재는 트레일러를 어떻게 담는가

공개 HTML에는 제목·저자·커버만 있고, 상세 화면은 `apis.millie.co.kr/v3/content/detail/book/<id>/`를 XHR로 받는다. 헤드리스 Chromium으로 캡처해 23권을 확인했고 3권(싯다르타·용의자 X의 헌신·대온실 수리 보고서)에 트레일러가 있었다. 원본 JSON은 `.tmp/millie/`(gitignore)에 있다. 공식 오픈 API는 없다 — 가져오기 자동화 대상이 아니다.

도서 상세의 주요 필드: 서지(`content_name`·`author`·`publisher`·`published_at`·`book_isbn13`·`ebook_isbn13`·`total_page`·`toc`), 소개(`book_report`·`publisher_review`·`author_report`), 시리즈(`series_*`), 키워드, 오디오북 플래그들, `mp3_preview_info`(미리듣기), `promotion_info`(한 줄 홍보 문구 2개), `book_trailer`(배열).

`book_trailer[]` 한 항목:

| 필드 | 뜻 |
|---|---|
| `trailer.trailer_seq`·`title`·`use` | 트레일러는 **도서와 별개 엔티티**. 같은 영상(원작 BEST6 에피소드)이 여러 책에 붙는다 |
| `main_video_source_type='Y'`·`main_video_url` | 본편은 유튜브 URL |
| `main_video_thumb_url`·`main_video_title`·`main_video_channel_name` | 자체 CDN 썸네일 + 유튜브 메타 복사본 |
| `sub_video_mov_url`·`sub_video_thumb_url` | 짧은 mp4 티저를 자체 CDN에 둔다 — 상세 화면 자동재생용으로 보인다 |
| `shape_type='H'` | 가로/세로 힌트 |
| `main_video_yn`·`btr_order` | 도서별 대표 여부·순서 (조인 쪽 필드) |

정리: 밀리는 "유튜브 본편 + 자체 호스팅 짧은 티저 + 썸네일"을 재사용 가능한 엔티티로 두고 도서에 N개를 순서·대표 플래그로 연결한다. 다만 내용은 도서별 예고편이 아니라 밀리 채널 기획 영상이 대부분이다.

## 2. 우리 DB에서 참고할 구조

이미 거의 같은 모양이 있다. `post_videos`(게시물 1:1)가 `source_type('upload'|'youtube')`·`video_path`·`youtube_id`·`hls_path`·`poster_path`·`renditions`·`duration_sec`·`asset_group_id → video_uploads`를 갖고, `video_uploads`가 묶음 업로드의 검증(`status='ready'`는 서버만 기록)·정리(`claim_video_cleanup`)·쓰기 가드(`can_write_video_bundle`)를 관리한다. 관리자 `VideoBundleField`·저장 RPC `save_video_post`·클라이언트 `UploadVideo`/`YoutubeVideo`/`FeedVideo`까지 전부 그대로 쓸 수 있다.

밀리의 "본편 유튜브 + 자체 티저" 2단은 우리 `youtube`·`upload` 두 소스가 각각 맡는다. 썸네일은 저장하지 않는다 — 유튜브는 `youtubeThumbnailUrl(id)`, 업로드는 `poster_path`로 그때 만든다.

## 3. 무엇을 하지 않는가

- **서버 변환을 두지 않는다.** 2026-09-11 결정(관리형 SaaS·변환 서버 없음, `docs/video-operations.md`)을 유지한다. 변환은 관리자의 기기 안에서 끝난다.
- **재사용 엔티티(밀리식 N:M)를 만들지 않는다.** 사용자 결정으로 도서당 하나다. 필요해지면 `book_trailers`를 조인으로 바꾸는 마이그레이션 하나로 갈 수 있다 — 컬럼 모양은 그대로다.
- **사용자 화면에 노출하지 않는다.** RLS 읽기는 공개로 열어 두어 다음 단계에서 정책을 다시 만지지 않게 한다. `FeedBook`·`BOOK_SELECT`는 건드리지 않는다.
- **멀티스레드 wasm 코어를 1차에서 쓰지 않는다.** COOP/COEP 헤더가 필요해 관리자 앱의 외부 이미지 로딩(표지·포스터 미리보기)을 깨뜨릴 수 있다. 속도 스파이크(§4.4)가 기준을 못 넘을 때 별건으로 판단한다.
- 커스텀 썸네일, 여러 트레일러, 티저 2단 구조, 트레일러 제목 — 전부 두지 않는다. 트레일러는 도서에 종속된 영상 하나다.

## 4. 변환 — 관리자 화면에서 mp4를 버튼 한 번으로

### 4.1 접근 방식 비교

| 안 | 내용 | 판단 |
|---|---|---|
| **A. 브라우저 FFmpeg(wasm)** | `@ffmpeg/ffmpeg` 0.12(MIT) + `@ffmpeg/core` 0.12(GPL-2.0-or-later, wasm ≈31MB)를 관리자 영상 칸에서만 지연 로드해 PC 도구와 **같은 산출물**을 만든다 | **채택** — 서버·DB·재생기·업로드 검증이 한 줄도 안 바뀐다. "로컬 기기에서 변환"이라는 요구와 정확히 맞는다 |
| B. PC 도구만 유지 | `convert-video.cmd` → ZIP 업로드 | 기각 — 사용자가 화면 안에서 끝내길 원한다. 단, 우회로로 남긴다 |
| C. 서버 변환 | Vercel 함수는 FFmpeg 장시간 실행에 부적합. 별도 워커·큐 필요 | 기각 — 09-11 결정 위반 |
| D. WebCodecs + 자체 먹서 | 하드웨어 인코딩으로 빠르다 | 기각 — fMP4(`#EXT-X-MAP`) 출력이라 우리 재생 목록 검증(`validateVideoPlaylist`)이 거부하고, AAC 인코딩 지원이 브라우저마다 갈린다. 산출물 형식을 바꿔야 해 범위가 커진다 |

### 4.2 동작

`VideoBundleField`(영상 게시물 폼과 트레일러 섹션이 공유) 하나를 확장한다.

1. 파일 칸이 `.zip` 외에 `.mp4`·`.mov`(`video/mp4`, `video/quicktime`)를 받는다. 라벨은 「영상 파일 또는 변환한 ZIP」.
2. 영상 파일이면 `<video>` 메타데이터로 길이·해상도를 읽어 보이고 **「변환」 버튼**을 낸다. ZIP이면 지금 흐름 그대로다.
3. 「변환」을 누르면 FFmpeg(wasm)를 처음 한 번 내려받아 다음을 메모리(MEMFS)에 만든다 — PC 도구 `scripts/convert-video.mjs`와 **파일 단위로 같은 산출물**: 화질별 `NNNp/index.m3u8` + `segment_%04d.ts`(2초, 독립 세그먼트), `master.m3u8`, `fallback.mp4`(짧은 변 ≤720 중 최대 화질을 `-c copy` + faststart), `poster.jpg`(첫 프레임), `manifest.json`(version 1).
4. 산출물을 `parseVideoManifest`·`validateVideoPlaylist`(이미 공유 패키지에 있다)로 검증해 `readVideoBundle`과 같은 `{ manifest, bytes }` 모양으로 만든다. 그 뒤는 지금과 완전히 같다 — 포스터 미리보기 → 「영상 업로드」 → TUS/직접 전송 → 서버 `complete` 검증 → `ready`.
5. 진행률은 화질별·전체로 보이고 「중단」은 `ffmpeg.terminate()`로 끝낸다. 파일을 바꾸면 처음부터다.

인코딩 인자는 PC 도구와 같다(libx264 CRF 23 + 화질별 maxrate/bufsize, 30fps, GOP 60, 2초 강제 키프레임, AAC 96k 스테레오, 무음 원본은 음성 트랙 없음). 차이는 `-preset`만 두며, 스파이크(§4.4) 결과로 `fast`/`veryfast` 중 정한다.

### 4.3 공유 사다리 함수 — `packages/shared/src/video-ladder.ts`

`convert-video.mjs` 안의 화질 사다리 계산(짧은 변 기준 480/720/1080 중 원본 이하만, 없으면 짝수로 내린 원본 크기 하나; 화질별 kbps 800/1600/3000; `bandwidth = (rate×1.15 + 96)×1000`; fallback = 짧은 변 ≤720 중 최대)을 순수 함수로 뽑아 PC 도구와 브라우저가 **같은 함수**를 부른다. 회전 메타데이터는 호출자가 미리 반영한다(브라우저는 `videoWidth/Height`가 이미 표시 방향이고, PC 도구는 ffprobe 회전값으로 바꿔 넘긴다). React·DOM 의존 없음, 단위 테스트로 고정한다.

### 4.4 제약과 스파이크 관문

브라우저 FFmpeg는 단일 스레드라 PC 도구보다 훨씬 느리다. 그래서 **구현 첫 작업은 속도 측정**이다.

- 측정: 관리자 PC의 Chromium에서 60초 1080p(세로) 샘플을 480·720으로 변환하는 데 걸리는 시간. 1080p 포함 시간도 따로 잰다.
- 판정 기준(제안): 480+720이 **5분 이하**면 채택. 넘으면 (a) 브라우저 경로 상한을 2분으로 내리고 480+720만 만들거나, (b) 멀티스레드 코어(COOP/COEP) 도입을 별건으로 검토한다. 어느 쪽이든 사용자가 결정한다 — 숫자는 실측 뒤 이 문서에 기록한다.

**실측 (2026-09-12, 60초 1080×1920 30fps 샘플, Chromium 헤드리스 / 헤드풀):**
코어 로드 0.2s(헤드풀 0.3s) · 480p 55.1s(헤드풀 55.2s) · 720p 97.8s(헤드풀 98.5s) · 1080p 145.7s · 합계(480+720, veryfast) 153.1s(헤드풀 154.0s) · (fast) 250.6s · (480+720+1080, veryfast) 299.1s.
→ 확정: 브라우저 경로 상한 길이 **180초**, 파일 **300MB**, preset **veryfast**, 1080p **포함**.

- 브라우저 경로 입력 상한(위 실측으로 확정): 길이 **3분(180초)**, 파일 **300MB**. 넘으면 "PC 변환 도구를 사용하세요"로 안내한다(PC 도구는 10분·512MiB). MEMFS는 입력·산출물을 모두 메모리에 두므로 이 상한이 곧 메모리 상한이다.
- HDR(`smpte2084`·`arib-std-b67`) 원본은 브라우저 경로에서 **거부**하고 PC 도구를 안내한다 — 브라우저 코어에는 톤매핑 필터(zscale)가 없다. 판별은 `-i` 스트림 덤프 로그에서 한다.
- 권장 길이는 기존과 같이 30~60초다(트레일러도 짧다).

### 4.5 로딩과 라이선스

- `@ffmpeg/ffmpeg`·`@ffmpeg/util`은 admin 의존성으로 두고 **래퍼와 워커는 번들러가 같은 출처로 내보낸다.** 코어(`ffmpeg-core.js`·`.wasm`)는 jsdelivr의 **esm 빌드**(`@ffmpeg/core@0.12.10/dist/esm`)를 **버전 고정**으로 `toBlobURL`을 거쳐 지연 로드한다 — blob이라 CORS 문제가 없고, 관리자 앱에 CSP가 없어 막히지 않는다. 영상 칸이 처음 「변환」을 누를 때만 내려받는다(FRONTEND.md §6 무거운 라이브러리 규칙).
- **스파이크 실측(2026-09-13)으로 굳어진 제약:** 래퍼는 워커를 `type: "module"`로 만든다. 그래서 ① ESM `worker.js`는 `./const.js`·`./errors.js` 상대 import가 풀려야 하므로 blob URL로 넘길 수 없고, ② UMD 워커 청크는 module 워커에서 `importScripts`가 막혀 코어를 못 읽고, ③ 코어는 module 워커가 `import()`로 읽으므로 default export가 있는 **esm 빌드**여야 한다(umd 코어를 주면 오류 없이 멈춘다). 따라서 `classWorkerURL`로 CDN 워커를 넘기는 방식은 쓰지 않고, 워커는 번들 자산으로 같은 출처에서 뜨게 한다. Turbopack이 `new URL("./worker.js", import.meta.url)`을 자산으로 내보내지 못하면 `apps/admin/public/ffmpeg/`에 `dist/esm`의 `worker.js`·`const.js`·`errors.js`를 복사해 `classWorkerURL: "/ffmpeg/worker.js"`로 넘기는 것이 대안이다.
- 코어는 GPL-2.0-or-later다(x264 포함). 래퍼는 MIT. 관리자 브라우저에서만 실행되고 우리 코드와 링크되지 않지만, 사용 사실과 출처를 `docs/licenses/ffmpeg-wasm.txt`에 남긴다.

## 5. 스키마 — `20260912000003_book_trailers.sql`

```sql
create table public.book_trailers (
  book_id uuid primary key references public.books (id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'youtube')),
  video_path text,          -- upload: fallback.mp4 공개 URL (post_videos와 같은 뜻 — 경로가 아니다)
  youtube_id text,          -- youtube
  duration_sec int,
  hls_path text, poster_path text, renditions jsonb,
  asset_group_id uuid references public.video_uploads (id),
  created_at timestamptz not null default now(),
  check ((source_type = 'upload' and video_path is not null)
      or (source_type = 'youtube' and youtube_id is not null))
);
create index book_trailers_asset_group_idx on public.book_trailers (asset_group_id);
alter table public.book_trailers enable row level security;
create policy book_trailers_select_all on public.book_trailers for select using (true);
create policy book_trailers_admin_write on public.book_trailers
  for all using (public.is_admin()) with check (public.is_admin());
```

읽기를 공개로 두는 이유: 도서 자체가 공개 데이터이고, 다음 단계(도서 시트 노출)에서 정책을 다시 열지 않기 위해서다. 쓰기는 RPC만 쓰지만 정책은 `post_videos`와 같은 모양으로 둔다.

**RPC `save_book_trailer(p_book_id uuid, p_source text, p_youtube_id text default null, p_upload_id uuid default null) returns void`** — `security definer`, `save_video_post`와 같은 규칙:

- `is_admin()` 아니면 예외. 도서 행을 `for update`로 잠근다(없으면 예외).
- `p_source = 'none'` → 행 삭제. 묶음 파일은 남는다(게시물과 같이 `/admin/videos`에서 명시적으로 정리).
- `'youtube'` → `^[a-zA-Z0-9_-]{11}$` 검증 후 upsert. 업로드 필드는 전부 null로.
- `'upload'` → `p_upload_id`가 있으면 `video_uploads`를 `for update`로 잠가 `status='ready'`를 확인하고, **다른 게시물(`post_videos`)이나 다른 도서의 트레일러가 이미 쓰는 묶음이면 예외**. 경로는 `public_base || '/fallback.mp4' | '/master.m3u8' | '/poster.jpg'`, `duration_sec = ceil(manifest.duration)`, `renditions = manifest.renditions`. `p_upload_id`가 없고 기존 행이 upload면 유지(no-op), 아니면 "영상 묶음을 업로드하세요".
- `revoke … from public, anon; grant execute to authenticated`.

**기존 함수 갱신** (`create or replace`):

- `save_video_post`: 묶음 독점 검사에 `exists(select 1 from book_trailers where asset_group_id = p_upload_id)`를 더한다 → "트레일러에 연결된 영상입니다".
- `claim_video_cleanup`: `book_trailers.asset_group_id` 참조가 있으면 `false`. 이걸 빠뜨리면 정리 화면이 트레일러 영상 파일을 지운다.

생성 타입은 `npm run db:types`로 갱신한다(격리 로컬 DB에 마이그레이션 적용 후).

## 6. 어드민

### 6.1 도서 폼 — 「트레일러」 섹션

`BookForm`(서버 컴포넌트)에 「본문과 표지」 다음 섹션으로 `BookTrailerField`(클라이언트 leaf)를 넣는다.

- 소스 선택: **없음 / 유튜브 / 영상 파일**. 기본은 기존 트레일러의 소스, 없으면 「없음」.
- 유튜브: URL 또는 ID 입력(`parseYoutubeId`가 watch·youtu.be·shorts·embed 전부 인식). 수정 화면에서는 현재 ID와 `hqdefault` 썸네일을 보인다.
- 영상 파일: §4의 `VideoBundleField`(`existing`으로 기존 영상 유지 문구 처리). 수정 화면에서는 현재 포스터·길이·화질을 보인다.
- 「없음」으로 바꿔 저장하면 제거다. 별도 삭제 버튼을 두지 않는다.
- 폼 필드: `trailer_source`, `trailer_youtube_url`, `video_upload_id`(VideoBundleField가 채운다).
- **제출 가드**: 소스가 「영상 파일」인데 업로드가 끝나지 않았고 기존 영상도 없으면, 필드가 가장 가까운 `form`의 submit을 가로채 막고 "영상 업로드를 먼저 완료하세요"를 인라인으로 보인다. 저장 버튼이 서버 컴포넌트 쪽에 있어 상태를 넘겨받을 수 없기 때문이며, 서버 검증(§6.2)이 최종 방어선이다.

새 도서에서도 묶음 업로드는 도서 행보다 먼저 끝날 수 있으므로(`video_uploads`는 독립 행) 한 화면에서 등록이 끝난다.

### 6.2 `saveBook` 흐름

1. 트레일러 입력을 **어떤 업로드보다 먼저** 검증한다: 소스 값, 유튜브 ID 파싱 실패, 업로드 소스인데 `video_upload_id`도 기존 upload 트레일러도 없음 → 지금과 같은 방식으로 `/admin/books?error=`로 되돌린다(신규) 또는 수정 화면으로(`/admin/books/[id]?error=`).
2. 기존 순서대로 표지·EPUB 업로드 → 도서 upsert.
3. 도서 저장이 성공한 뒤 `db.rpc('save_book_trailer', …)`. 실패하면 도서는 저장된 상태이므로 메시지를 그렇게 쓴다 — "도서는 저장했지만 트레일러를 저장하지 못했습니다: …" — 그리고 **수정 화면**으로 보내 다시 시도하게 한다. 수정 화면에 `AdminNotice`(error)를 추가한다(지금은 imported·exists 토스트만 있다).
4. 성공 시 리다이렉트는 지금과 같다(`/admin/books?saved=1`).

두 쓰기(도서·트레일러)는 한 트랜잭션이 아니다. 관리자 내부 화면이고 실패가 화면에 그대로 드러나며 재시도가 한 번의 저장이라 받아들인다 — `featured_books`의 여러 액션과 같은 수준이다.

### 6.3 수정 화면·목록·업로드 기록

- `/admin/books/[bookId]`: `book_trailers` 행을 함께 읽어 `BookForm`에 `trailer`로 넘긴다.
- `/admin/books` 목록: 「유형」 옆에 트레일러 유무 배지(「트레일러」)를 더한다. 작은 변경이고 관리자가 어느 도서에 영상이 있는지 목록에서 알 수 있다.
- `/admin/videos`: `select('…, post_videos(post_id), book_trailers(book_id)')`로 읽어 「트레일러에서 사용 중」과 도서 수정 링크를 보인다. 안내 문구의 "게시물에 연결된 영상"을 "게시물·트레일러에 연결된 영상"으로 고친다.
- `deleteBook`: 행 삭제로 `book_trailers`가 cascade된다. 묶음 파일은 게시물 삭제와 같이 남기고 `/admin/videos`에서 정리한다.

## 7. 클라이언트

이번 범위에 없다. 코드 변경도 없다. 다음 단계에서 도서 시트 상단에 포스터 + 재생 글리프로 붙일 때는 `book_trailers`를 `BOOK_SELECT` 임베드로 읽고 `FeedBook`에 필드를 더한다 — `book-fields.ts`의 완전성 검사가 그 변경을 강제한다.

## 8. 테스트

| 층 | 무엇 |
|---|---|
| 단위 (vitest) | `video-ladder.ts`: 1080 세로·720 가로·작은 원본(짝수 내림)·정사각·fallback 선택 |
| 격리 DB (`tests/live-db/book-trailers.test.ts`) | 일반 사용자·anon의 `save_book_trailer` 거부 · 미검증(`uploading`) 묶음 거부 · 게시물에 붙은 묶음을 트레일러에 붙이면 거부, 반대도 거부 · youtube→upload→none 전환 시 필드 정리 · `claim_video_cleanup`이 트레일러 참조를 존중 · 도서 삭제 cascade |
| E2E (`e2e/admin.trailer.spec.ts`, 375px) | ① 새 도서 + 유튜브 트레일러 저장 → 수정 화면에 썸네일 → 「없음」으로 저장 → 행 없음. ② 3초 mp4 픽스처를 실제 Chromium에서 「변환」 → 업로드 → 저장 → `book_trailers.hls_path`가 `master.m3u8`. ③ 업로드 미완료 상태의 제출 가드 |
| 기존 갱신 | `e2e/admin.video.spec.ts`의 라벨(`변환한 영상 ZIP` → 새 라벨), `tests/live-db/video-bundles.test.ts`에 트레일러 독점 케이스 |

E2E ②의 wasm 변환은 헤드리스 Chromium에서도 돌지만 느리다 — 픽스처는 3초·360p 한 화질로 작게 둔다. 실제 속도 판정은 §4.4 스파이크가 담당한다.

## 9. 문서

- PRD: §5.3 아래 「도서 트레일러」 항목(무엇을 저장하고, 사용자 노출은 후속), §6에 `book_trailers`, §11 결정 기록 — 밀리 조사 요약(§1), 1:1 선택 이유, 브라우저 변환 채택과 서버 변환 미채택, 스파이크 결과 수치.
- `docs/video-operations.md`: 「관리자 화면에서 mp4 직접 변환」 절(절차·상한·HDR 거부·PC 도구 우회로), 정리 규칙에 트레일러 추가, 검증 목록 갱신.
- `docs/FRONTEND.md` §6: 브라우저 FFmpeg는 관리자 영상 칸에서만 지연 로드한다는 한 줄.
- `docs/licenses/ffmpeg-wasm.txt`: 코어 GPL 고지와 출처·버전.

## 10. 완료 기준

- `npm run build`, `npm test`, `npm run test:integration`(격리 DB), `e2e/admin.trailer.spec.ts`·`e2e/admin.video.spec.ts` 통과.
- 375px에서 도서 폼의 트레일러 섹션·변환 진행·수정 화면을 실제로 렌더해 확인.
- 스파이크 수치가 §4.4에 기록되고, 상한·preset이 그 수치로 확정돼 문서와 코드가 같은 값을 말한다.
- 마이그레이션은 로컬 격리 DB에 먼저 적용해 타입을 갱신하고, 운영 적용은 앱 배포 순서와 함께 별도로 결정한다(DB 추가 → 앱 배포 순서는 `video-operations.md`의 기존 규칙과 같다).
