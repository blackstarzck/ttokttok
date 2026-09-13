# 도서 트레일러 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 도서 폼 안에서 유튜브 주소나 mp4 파일로 도서당 트레일러 하나를 등록하고, mp4는 브라우저 안에서 버튼 한 번으로 HLS 묶음으로 변환해 기존 업로드 파이프라인으로 저장한다.

**Architecture:** 저장은 `post_videos`를 그대로 본뜬 1:1 표 `book_trailers`와 RPC `save_book_trailer`가 맡고, 기존 `video_uploads` 검증·정리 규칙을 공유한다. 변환은 `VideoBundleField`가 mp4를 받을 때 `@ffmpeg/ffmpeg`(wasm)로 PC 도구(`scripts/convert-video.mjs`)와 파일 단위로 같은 산출물을 메모리에 만들어 지금의 검증·업로드 흐름에 넘긴다. 화질 사다리·마스터 재생 목록 같은 순수 계산은 `packages/shared`로 뽑아 PC 도구와 브라우저가 같은 함수를 쓴다. 사용자 화면은 이번 범위가 아니다.

**Tech Stack:** Next.js 16 App Router(서버 액션·`PageProps`), Supabase(Postgres RPC·RLS·Storage), `@ffmpeg/ffmpeg` 0.12 + `@ffmpeg/core` 0.12(jsdelivr, 버전 고정), fflate, tus-js-client, zod, vitest, node:test(격리 DB), Playwright.

설계 원천: `docs/superpowers/specs/2026-09-12-book-trailer-design.md`. 이 계획의 절 번호 참조(§n)는 그 문서의 절이다.

## Global Constraints

- 스타일은 시맨틱 토큰만(`bg-background`·`text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 금지 (AGENTS.md, DESIGN.md).
- 서버 컴포넌트가 기본. `"use client"`는 상태가 필요한 leaf에만 (FRONTEND.md §2). 무거운 라이브러리는 필요한 자리에서만 동적 로드 (FRONTEND.md §6).
- 보안은 RLS와 RPC가 담당. 폼의 URL·업로드 ID를 신뢰하지 않는다 — 서버가 `video_uploads.status='ready'`를 확인한 묶음만 연결한다 (§5).
- `packages/shared`는 React·Next·DOM·네트워크에 의존하지 않는다 (AGENTS.md 모노레포 경계).
- 마이그레이션 파일명은 `20260912000003_book_trailers.sql`. 운영 DB에는 적용하지 않는다 — 로컬 격리 DB(`ttokttok-e2e`, 포트 54421)에만 (§10).
- 격리 DB는 다른 세션과 공유된다. `db reset` 금지, `migration up`으로 추가만 한다. 작업 직전 `docker ps`로 컨테이너 상태를 확인한다 (메모리 `concurrent-sessions-share-tree-and-e2e-db`).
- 브라우저 변환 경로 상한: 길이 180초, 파일 300MB(초안, Task 2 스파이크 결과로 확정). HDR(`smpte2084`·`arib-std-b67`) 원본은 거부하고 PC 도구를 안내한다 (§4.4).
- wasm 코어는 `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/` 에서 `toBlobURL`로 지연 로드한다. 버전을 다른 값으로 바꾸지 않는다 (§4.5).
- 라벨 문구: 파일 칸 「영상 파일 또는 변환한 ZIP」, 버튼 「변환」·「변환 중단」·「영상 업로드」, 트레일러 소스 「없음 / 유튜브 / 영상 파일」, 가드 문구 「영상 업로드를 먼저 완료하세요」 (§4.2, §6.1).
- 완료 기준: `npm run build`, `npm test`, `node --conditions=react-server --import tsx --test tests/live-db/book-trailers.test.ts tests/live-db/video-bundles.test.ts`, `npx playwright test e2e/admin.trailer.spec.ts e2e/admin.video.spec.ts` 통과 + 375px 실제 렌더 확인 (§10).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`을 붙인다. 작업 트리는 워크트리 `.claude/worktrees/book-trailer`(브랜치 `worktree-book-trailer`)다. 부모 트리에서 checkout 하지 않는다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `packages/shared/src/video-ladder.ts` (신규) | 화질 사다리·fallback 선택·마스터 재생 목록 문자열. 순수 함수 |
| `packages/shared/src/video-ladder.test.ts` (신규) | 위 함수 단위 테스트 |
| `packages/shared/src/video-encode.ts` (신규) | FFmpeg 인자 조립, `-i` 스트림 덤프 로그 해석(음성·HDR·회전). 순수 함수. PC 도구와 브라우저가 공유 |
| `packages/shared/src/video-encode.test.ts` (신규) | 위 함수 단위 테스트 |
| `scripts/convert-video.mjs` (수정) | 인라인 계산을 공유 함수 호출로 교체. 산출물은 그대로 |
| `apps/admin/src/lib/video-convert.ts` (신규) | 브라우저 FFmpeg 로드·프로브·변환. `{ manifest, bytes }`를 돌려준다 |
| `apps/admin/src/lib/video-upload.ts` (수정) | `readVideoBundle`에서 묶음 검증을 `validateBundleFiles(bytes)`로 분리해 변환 결과도 같은 검증을 탄다 |
| `apps/admin/src/components/admin/video-bundle-field.tsx` (수정) | mp4·mov 수용, 「변환」 버튼·진행률·중단, 라벨 변경 |
| `supabase/migrations/20260912000003_book_trailers.sql` (신규) | 표·RLS·`save_book_trailer`·`save_video_post`/`claim_video_cleanup` 갱신 |
| `packages/database/src/types.ts` (재생성) | `npm run db:types` |
| `tests/live-db/book-trailers.test.ts` (신규) | RPC 권한·검증·독점·정리 잠금 |
| `apps/admin/src/components/admin/book-trailer-field.tsx` (신규) | 도서 폼의 트레일러 섹션(클라이언트 leaf, 제출 가드 포함) |
| `apps/admin/src/components/admin/book-form.tsx` (수정) | 섹션 추가, `trailer` prop |
| `apps/admin/src/app/admin/(dashboard)/books/actions.ts` (수정) | 트레일러 입력 검증, 도서 저장 뒤 RPC 호출 |
| `apps/admin/src/app/admin/(dashboard)/books/[bookId]/page.tsx` (수정) | 트레일러 임베드 조회, `AdminNotice` |
| `apps/admin/src/app/admin/(dashboard)/books/page.tsx` (수정) | 「트레일러」 배지 |
| `apps/admin/src/app/admin/(dashboard)/videos/page.tsx` (수정) | 트레일러 사용처 표시 |
| `e2e/video-fixture.ts` (수정) | 3초 mp4 픽스처 생성 함수 추가 |
| `e2e/admin.video.spec.ts` (수정) | 라벨 문구 갱신 |
| `e2e/admin.trailer.spec.ts` (신규) | 유튜브·mp4 변환·제출 가드 E2E |
| `docs/prd-ttokttok.md`, `docs/video-operations.md`, `docs/FRONTEND.md`, `docs/licenses/ffmpeg-wasm.txt`, 설계 문서 §4.4 (수정) | 문서 |

---

### Task 1: 화질 사다리·마스터 재생 목록을 공유 함수로 뽑는다

**Files:**
- Create: `packages/shared/src/video-ladder.ts`
- Create: `packages/shared/src/video-ladder.test.ts`
- Modify: `scripts/convert-video.mjs`

**Interfaces:**
- Produces:
  - `type LadderRendition = { label: string; width: number; height: number; rate: number; bandwidth: number; playlist: string }` — `rate`는 kbps(인코더용), `bandwidth`는 bps(재생 목록용).
  - `buildVideoLadder(width: number, height: number): { renditions: LadderRendition[]; fallback: LadderRendition }` — 입력은 **표시 방향이 반영된** 크기.
  - `toManifestRendition(r: LadderRendition): { label; width; height; bandwidth; playlist }` — manifest의 `.strict()` 스키마에 맞게 `rate`를 뗀다.
  - `buildMasterPlaylist(renditions: LadderRendition[]): string`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/src/video-ladder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildMasterPlaylist,
  buildVideoLadder,
  toManifestRendition,
} from "@ttokttok/shared/video-ladder";

describe("buildVideoLadder", () => {
  it("1080 세로 원본은 480·720·1080 세 화질, fallback은 720", () => {
    const { renditions, fallback } = buildVideoLadder(1080, 1920);
    expect(renditions.map((r) => r.label)).toEqual(["480p", "720p", "1080p"]);
    expect(renditions[0]).toMatchObject({ width: 480, height: 852, rate: 800, playlist: "480p/index.m3u8" });
    expect(renditions[1]).toMatchObject({ width: 720, height: 1280, rate: 1600 });
    expect(renditions[2]).toMatchObject({ width: 1080, height: 1920, rate: 3000 });
    expect(fallback.label).toBe("720p");
  });

  it("720 가로 원본은 480·720 두 화질이고 짝수 크기로 내린다", () => {
    const { renditions } = buildVideoLadder(1280, 720);
    expect(renditions.map((r) => r.label)).toEqual(["480p", "720p"]);
    expect(renditions[0]).toMatchObject({ width: 852, height: 480 });
    expect(renditions[1]).toMatchObject({ width: 1280, height: 720 });
  });

  it("작은 원본은 짝수로 내린 원본 크기 한 화질만 만든다", () => {
    const { renditions, fallback } = buildVideoLadder(361, 641);
    expect(renditions).toHaveLength(1);
    expect(renditions[0]).toMatchObject({ label: "360p", width: 360, height: 640, rate: 800 });
    expect(fallback.label).toBe("360p");
  });

  it("bandwidth는 (rate×1.15 + 96)×1000을 반올림한 값이다", () => {
    const { renditions } = buildVideoLadder(1080, 1920);
    expect(renditions[0].bandwidth).toBe(Math.round((800 * 1.15 + 96) * 1000));
  });

  it("toManifestRendition은 rate를 뗀다", () => {
    const { renditions } = buildVideoLadder(1080, 1920);
    expect(Object.keys(toManifestRendition(renditions[0])).sort()).toEqual(
      ["bandwidth", "height", "label", "playlist", "width"],
    );
  });
});

describe("buildMasterPlaylist", () => {
  it("화질마다 STREAM-INF 한 줄과 재생 목록 경로 한 줄을 쓴다", () => {
    const { renditions } = buildVideoLadder(1280, 720);
    const text = buildMasterPlaylist(renditions);
    expect(text.startsWith("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n")).toBe(true);
    expect(text).toContain(`#EXT-X-STREAM-INF:BANDWIDTH=${renditions[0].bandwidth},RESOLUTION=852x480\n480p/index.m3u8\n`);
    expect(text.endsWith("720p/index.m3u8\n")).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/shared/src/video-ladder.test.ts`
Expected: FAIL — `Failed to load url @ttokttok/shared/video-ladder`.

- [ ] **Step 3: 구현**

`packages/shared/src/video-ladder.ts`:

```ts
/**
 * 화질 사다리 — PC 변환 도구(scripts/convert-video.mjs)와 브라우저 변환
 * (apps/admin/src/lib/video-convert.ts)이 같은 함수를 쓴다. 두 경로의
 * 산출물이 파일 단위로 같아야 재생기·검증이 하나로 유지된다.
 *
 * 입력 크기는 회전 메타데이터가 이미 반영된 표시 크기다. 브라우저의
 * videoWidth/videoHeight가 그렇고, PC 도구는 ffprobe 회전값으로 바꿔 넘긴다.
 */
export type LadderRendition = {
  label: string;
  width: number;
  height: number;
  /** kbps — 인코더의 maxrate/bufsize 계산에 쓴다. */
  rate: number;
  /** bps — HLS 재생 목록의 BANDWIDTH. */
  bandwidth: number;
  playlist: string;
};

const LEVELS = [480, 720, 1080] as const;

function rateFor(level: number) {
  return level <= 480 ? 800 : level <= 720 ? 1600 : 3000;
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export function buildVideoLadder(width: number, height: number): {
  renditions: LadderRendition[];
  fallback: LadderRendition;
} {
  const short = Math.min(width, height);
  const levels: number[] = LEVELS.filter((n) => n <= short);
  // 원본보다 큰 화질은 만들지 않는다. 작은 원본은 그 크기 하나만.
  if (!levels.length) levels.push(even(short));
  const renditions = levels.map((level) => {
    const rate = rateFor(level);
    return {
      label: `${level}p`,
      width: even((width * level) / short),
      height: even((height * level) / short),
      rate,
      bandwidth: Math.round((rate * 1.15 + 96) * 1000),
      playlist: `${level}p/index.m3u8`,
    };
  });
  // 호환 mp4는 짧은 변 720 이하 중 가장 큰 화질에서 뜬다.
  const fallback =
    [...renditions].reverse().find((r) => Math.min(r.width, r.height) <= 720) ??
    renditions[0];
  return { renditions, fallback };
}

export function toManifestRendition(r: LadderRendition) {
  return {
    label: r.label,
    width: r.width,
    height: r.height,
    bandwidth: r.bandwidth,
    playlist: r.playlist,
  };
}

export function buildMasterPlaylist(renditions: LadderRendition[]): string {
  return (
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
    renditions
      .map(
        (r) =>
          `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}\n${r.playlist}\n`,
      )
      .join("")
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run packages/shared/src/video-ladder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: PC 도구가 같은 함수를 쓰게 바꾼다**

`scripts/convert-video.mjs`에서 import 줄 아래에 추가:

```js
import { buildMasterPlaylist, buildVideoLadder, toManifestRendition } from '../packages/shared/src/video-ladder.ts';
```

`convertVideo` 안의 다음 블록을

```js
  const short = Math.min(width, height);
  const levels = [480, 720, 1080].filter(n => n <= short);
  if (!levels.length) levels.push(Math.floor(short / 2) * 2);
```

이렇게 바꾼다:

```js
  const ladder = buildVideoLadder(width, height);
```

`for (const level of levels) { … }` 루프 전체를 다음으로 바꾼다(인코딩 인자는 그대로다):

```js
  const renditions = [];
  for (const r of ladder.renditions) {
    const { width: w, height: h, rate, label: name } = r;
    await mkdir(join(output, name));
    console.log(`${name} 변환 중 (${renditions.length + 1}/${ladder.renditions.length})`);
    // Constrained quality encoding: static book/text clips should not fill a fixed bitrate budget.
    const codec = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-maxrate', `${Math.round(rate * 1.15)}k`, '-bufsize', `${rate * 2}k`, '-pix_fmt', 'yuv420p', ...(hdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : []), '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'];
    await ffmpeg(['-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `${prefix}scale=${w}:${h},setsar=1`, ...codec, '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments', '-hls_segment_filename', join(output, name, 'segment_%04d.ts'), join(output, name, 'index.m3u8')]);
    renditions.push(toManifestRendition(r));
  }
  const fallback = toManifestRendition(ladder.fallback);
```

그리고 `const fallback = [...renditions].reverse().find(...)` 줄을 지우고, `master.m3u8` 쓰는 줄을

```js
  await writeFile(join(output, 'master.m3u8'), buildMasterPlaylist(ladder.renditions));
```

로 바꾼다. 나머지(fallback.mp4·poster·manifest·zip)는 그대로다.

- [ ] **Step 6: PC 도구 회귀 확인**

Run: `node --test tests/video-conversion.test.mjs`
Expected: 기존과 같이 PASS (FFmpeg가 PATH에 있어야 한다. 없으면 `where ffmpeg`로 확인하고, 이 단계만 건너뛰지 말고 설치 뒤 다시 돈다).

Run: `npx vitest run packages/shared`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add packages/shared/src/video-ladder.ts packages/shared/src/video-ladder.test.ts scripts/convert-video.mjs
git commit -m "refactor(video): share the quality ladder between the PC converter and future browser path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 브라우저 FFmpeg 속도 스파이크 — 수치를 재고 상한을 확정한다

이 작업은 코드를 남기지 않는다(`.tmp/`는 gitignore). 결과 수치만 설계 문서 §4.4에 기록해 커밋한다.

**Files:**
- Create (커밋 안 함): `.tmp/spike/ffmpeg-wasm-spike.html`, `.tmp/spike/run.mjs`
- Modify: `docs/superpowers/specs/2026-09-12-book-trailer-design.md` (§4.4 실측 수치)

**Interfaces:**
- Produces: 확정 상수 — `BROWSER_MAX_DURATION_SEC`, `BROWSER_MAX_FILE_BYTES`, `BROWSER_PRESET`, 1080p 포함 여부. Task 3이 이 값을 코드 상수로 옮긴다.

- [ ] **Step 1: 60초 1080p 세로 샘플을 만든다**

```bash
mkdir -p .tmp/spike
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=1080x1920:rate=30:duration=60" -f lavfi -i "sine=frequency=440:duration=60" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 96k -shortest -movflags +faststart .tmp/spike/sample-1080p-60s.mp4
```

Expected: 파일 생성. `ls -la .tmp/spike/`로 크기 확인(수 MB).

- [ ] **Step 2: 스파이크 페이지를 쓴다**

`.tmp/spike/ffmpeg-wasm-spike.html` — 우리 앱과 무관한 빈 페이지에서 코어를 CDN으로 받아 두 화질을 인코딩하고 시간을 잰다. 인코딩 인자는 PC 도구와 같고 preset만 바꿔 본다.

```html
<!doctype html>
<meta charset="utf-8" />
<input id="file" type="file" accept="video/mp4" />
<select id="preset"><option>veryfast</option><option>fast</option></select>
<label><input id="with1080" type="checkbox" /> 1080p 포함</label>
<button id="go">변환</button>
<pre id="out"></pre>
<script type="module">
  import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
  import { toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";
  const out = document.getElementById("out");
  const log = (s) => { out.textContent += s + "\n"; console.log(s); };
  const BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
  const ladder = (w, h, with1080) => {
    const short = Math.min(w, h);
    const levels = [480, 720, ...(with1080 ? [1080] : [])].filter((n) => n <= short);
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
    return levels.map((level) => ({ label: `${level}p`, width: even((w * level) / short), height: even((h * level) / short), rate: level <= 480 ? 800 : level <= 720 ? 1600 : 3000 }));
  };
  document.getElementById("go").onclick = async () => {
    const file = document.getElementById("file").files[0];
    const preset = document.getElementById("preset").value;
    const with1080 = document.getElementById("with1080").checked;
    const t0 = performance.now();
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => { if (/error|Error/.test(message)) log(message); });
    await ffmpeg.load({ coreURL: await toBlobURL(`${BASE}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${BASE}/ffmpeg-core.wasm`, "application/wasm") });
    log(`load: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    await ffmpeg.writeFile("input.mp4", new Uint8Array(await file.arrayBuffer()));
    const video = document.createElement("video"); video.preload = "metadata"; video.src = URL.createObjectURL(file);
    await new Promise((r) => (video.onloadedmetadata = r));
    for (const r of ladder(video.videoWidth, video.videoHeight, with1080)) {
      const t = performance.now();
      await ffmpeg.createDir(r.label);
      const code = await ffmpeg.exec(["-i", "input.mp4", "-map", "0:v:0", "-map", "0:a:0?", "-vf", `scale=${r.width}:${r.height},setsar=1`, "-c:v", "libx264", "-preset", preset, "-crf", "23", "-maxrate", `${Math.round(r.rate * 1.15)}k`, "-bufsize", `${r.rate * 2}k`, "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*2)", "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-hls_segment_filename", `${r.label}/segment_%04d.ts`, `${r.label}/index.m3u8`]);
      log(`${r.label} (${preset}): exit ${code}, ${((performance.now() - t) / 1000).toFixed(1)}s`);
    }
    log(`total: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    window.__done = true;
  };
</script>
```

- [ ] **Step 3: Playwright로 실행해 수치를 얻는다**

`.tmp/spike/run.mjs` (워크트리 루트에서 실행. `playwright` 패키지는 루트 node_modules에 있다):

```js
import { chromium } from "playwright";
import { resolve } from "node:path";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log(m.text()));
await page.goto("file:///" + resolve(".tmp/spike/ffmpeg-wasm-spike.html").replaceAll("\\", "/"));
await page.setInputFiles("#file", ".tmp/spike/sample-1080p-60s.mp4");
await page.selectOption("#preset", process.argv[2] || "veryfast");
if (process.argv[3] === "1080") await page.check("#with1080");
await page.click("#go");
await page.waitForFunction(() => window.__done === true, null, { timeout: 30 * 60 * 1000 });
await browser.close();
```

Run(세 번, 각 결과를 기록):

```bash
node .tmp/spike/run.mjs veryfast
node .tmp/spike/run.mjs fast
node .tmp/spike/run.mjs veryfast 1080
```

Expected: 각 실행이 `load: …s`, `480p (...): exit 0, …s`, `720p (...): exit 0, …s`, `total: …s`를 출력한다. `exit 0`이 아니면 로그의 오류 줄을 읽고 인자를 고친다(코어에 없는 필터가 원인일 수 있다 — 이 인자들은 libx264·aac·scale만 쓴다).

**주의:** 헤드리스 Chromium의 수치는 관리자의 실제 브라우저와 다를 수 있다. 가능하면 `chromium.launch({ headless: false })`로 한 번 더 재서 둘 다 기록한다.

- [ ] **Step 4: 판정하고 문서에 기록한다**

판정 규칙(§4.4): 480+720(`veryfast`)이 **5분 이하**면 채택. 이때 1080p 포함 시간이 10분을 넘으면 브라우저 경로는 720p까지만 만든다(사다리에서 1080 제외 옵션을 Task 3의 `maxLevel` 인자로 준다). 5분을 넘으면 상한을 120초로 내리고 사용자에게 보고한다.

`docs/superpowers/specs/2026-09-12-book-trailer-design.md` §4.4의 "판정 기준(제안)" 문단 뒤에 다음 문단을 **실측값으로 채워** 추가한다(대괄호는 실제 숫자로 바꾼다):

```markdown
**실측 (2026-09-12, 60초 1080×1920 30fps 샘플, Chromium 헤드리스 / 헤드풀):**
코어 로드 [n]s · 480p [n]s · 720p [n]s · 1080p [n]s · 합계(480+720, veryfast) [n]s · (fast) [n]s.
→ 확정: 브라우저 경로 상한 길이 **[180|120]초**, 파일 **300MB**, preset **[veryfast|fast]**, 1080p **[포함|제외]**.
```

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-09-12-book-trailer-design.md
git commit -m "docs(trailer): record the in-browser FFmpeg timing spike and fix the browser-path limits

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 순수 인코딩 도우미 — 인자 조립과 스트림 덤프 해석

**Files:**
- Create: `packages/shared/src/video-encode.ts`
- Create: `packages/shared/src/video-encode.test.ts`

**Interfaces:**
- Produces:
  - `type StreamInfo = { hasVideo: boolean; hasAudio: boolean; hdr: boolean; durationSec: number | null }`
  - `parseStreamInfo(logLines: string[]): StreamInfo` — ffmpeg `-i` 덤프 로그를 읽는다.
  - `hlsEncodeArgs(input: string, r: LadderRendition, opts: { preset: string; hdr: boolean; hasAudio: boolean }): string[]` — 화질 하나의 HLS 인코딩 인자.
  - `fallbackArgs(playlist: string): string[]`, `posterArgs(playlist: string): string[]`.
  - `BROWSER_LIMITS = { maxDurationSec, maxFileBytes, preset, maxLevel }` — Task 2 확정값.

- [ ] **Step 1: 실패하는 테스트**

`packages/shared/src/video-encode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildVideoLadder } from "@ttokttok/shared/video-ladder";
import {
  fallbackArgs,
  hlsEncodeArgs,
  parseStreamInfo,
  posterArgs,
} from "@ttokttok/shared/video-encode";

const dump = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.mp4':",
  "  Duration: 00:01:00.03, start: 0.000000, bitrate: 2480 kb/s",
  "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920, 2380 kb/s, 30 fps, 30 tbr, 15360 tbn (default)",
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 96 kb/s (default)",
];

describe("parseStreamInfo", () => {
  it("영상·음성 스트림과 길이를 읽는다", () => {
    expect(parseStreamInfo(dump)).toEqual({ hasVideo: true, hasAudio: true, hdr: false, durationSec: 60.03 });
  });
  it("무음 원본은 hasAudio=false", () => {
    expect(parseStreamInfo(dump.filter((l) => !l.includes("Audio:"))).hasAudio).toBe(false);
  });
  it("HDR 전송 특성(smpte2084·arib-std-b67)을 잡는다", () => {
    const hdr = dump.map((l) => l.replace("yuv420p(tv, bt709, progressive)", "yuv420p10le(tv, bt2020nc/bt2020/smpte2084)"));
    expect(parseStreamInfo(hdr).hdr).toBe(true);
    const hlg = dump.map((l) => l.replace("bt709, progressive", "bt2020nc/bt2020/arib-std-b67"));
    expect(parseStreamInfo(hlg).hdr).toBe(true);
  });
  it("영상 스트림이 없으면 hasVideo=false, 길이 없으면 null", () => {
    expect(parseStreamInfo(["  Stream #0:0: Audio: aac"])).toEqual({ hasVideo: false, hasAudio: true, hdr: false, durationSec: null });
  });
});

describe("hlsEncodeArgs", () => {
  const r = buildVideoLadder(1080, 1920).renditions[1]; // 720p
  it("PC 도구와 같은 인코딩 인자를 만든다", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "veryfast", hdr: false, hasAudio: true });
    expect(args.slice(0, 2)).toEqual(["-i", "input.mp4"]);
    expect(args).toContain("scale=720:1280,setsar=1");
    expect(args.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 23 -maxrate 1840k -bufsize 3200k -pix_fmt yuv420p -r 30 -g 60 -keyint_min 60 -sc_threshold 0 -force_key_frames expr:gte(t,n_forced*2)");
    expect(args.join(" ")).toContain("-c:a aac -b:a 96k -ac 2");
    expect(args.slice(-2)).toEqual(["720p/segment_%04d.ts", "720p/index.m3u8"]);
    expect(args).toContain("-hls_time");
    expect(args).toContain("independent_segments");
  });
  it("무음 원본에는 음성 인자를 넣지 않는다", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "veryfast", hdr: false, hasAudio: false });
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("0:a:0?");
  });
  it("HDR 원본은 톤매핑 필터와 bt709 색 인자를 붙인다 (PC 도구 전용)", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "fast", hdr: true, hasAudio: true });
    expect(args.find((a) => a.startsWith("zscale=t=linear"))).toMatch(/,scale=720:1280,setsar=1$/);
    expect(args.join(" ")).toContain("-color_primaries bt709 -color_trc bt709 -colorspace bt709");
  });
});

describe("fallbackArgs / posterArgs", () => {
  it("호환 mp4는 스트림 복사 + faststart, 포스터는 첫 프레임 JPEG", () => {
    expect(fallbackArgs("720p/index.m3u8")).toEqual(["-i", "720p/index.m3u8", "-c", "copy", "-movflags", "+faststart", "fallback.mp4"]);
    expect(posterArgs("720p/index.m3u8")).toEqual(["-i", "720p/index.m3u8", "-frames:v", "1", "-q:v", "3", "poster.jpg"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/shared/src/video-encode.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`packages/shared/src/video-encode.ts` (`BROWSER_LIMITS` 숫자는 Task 2 확정값으로 채운다 — 아래는 초안값):

```ts
import type { LadderRendition } from "./video-ladder";

/**
 * FFmpeg 인자와 로그 해석 — PC 도구와 브라우저 변환이 공유하는 순수 함수.
 * 산출물이 파일 단위로 같아야 하므로 인코딩 인자는 여기 한 곳에만 있다.
 */
export type StreamInfo = {
  hasVideo: boolean;
  hasAudio: boolean;
  hdr: boolean;
  durationSec: number | null;
};

/** `ffmpeg -i input` 이 stderr에 찍는 스트림 덤프를 읽는다. */
export function parseStreamInfo(logLines: string[]): StreamInfo {
  const text = logLines.join("\n");
  const duration = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    hasVideo: /Stream #\d+:\d+.*: Video:/.test(text),
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(text),
    hdr: /smpte2084|arib-std-b67/.test(text),
    durationSec: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : null,
  };
}

/**
 * 브라우저 경로 상한 (설계 §4.4, 2026-09-12 스파이크로 확정).
 * PC 도구는 10분·512MiB까지 받으므로 넘는 파일은 그쪽으로 안내한다.
 */
export const BROWSER_LIMITS = {
  maxDurationSec: 180,
  maxFileBytes: 300 * 1024 * 1024,
  preset: "veryfast",
  /** 브라우저에서 만드는 최대 화질(짧은 변). 1080을 빼기로 했으면 720. */
  maxLevel: 1080,
} as const;

const HDR_PREFIX =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,";

export function hlsEncodeArgs(
  input: string,
  r: LadderRendition,
  opts: { preset: string; hdr: boolean; hasAudio: boolean },
): string[] {
  const dir = r.label;
  return [
    "-i", input,
    "-map", "0:v:0",
    ...(opts.hasAudio ? ["-map", "0:a:0?"] : []),
    "-vf", `${opts.hdr ? HDR_PREFIX : ""}scale=${r.width}:${r.height},setsar=1`,
    // Constrained quality encoding: static book/text clips should not fill a fixed bitrate budget.
    "-c:v", "libx264", "-preset", opts.preset, "-crf", "23",
    "-maxrate", `${Math.round(r.rate * 1.15)}k`, "-bufsize", `${r.rate * 2}k`,
    "-pix_fmt", "yuv420p",
    ...(opts.hdr ? ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"] : []),
    "-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-force_key_frames", "expr:gte(t,n_forced*2)",
    ...(opts.hasAudio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : []),
    "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", `${dir}/segment_%04d.ts`,
    `${dir}/index.m3u8`,
  ];
}

export function fallbackArgs(playlist: string): string[] {
  return ["-i", playlist, "-c", "copy", "-movflags", "+faststart", "fallback.mp4"];
}

export function posterArgs(playlist: string): string[] {
  return ["-i", playlist, "-frames:v", "1", "-q:v", "3", "poster.jpg"];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run packages/shared/src/video-encode.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: PC 도구도 이 인자를 쓰게 바꾼다 (산출물 동일성 보장)**

`scripts/convert-video.mjs`의 import에 추가:

```js
import { fallbackArgs, hlsEncodeArgs, posterArgs } from '../packages/shared/src/video-encode.ts';
```

Task 1에서 바꾼 루프의 `const codec = […]; await ffmpeg([…]);` 두 줄을 다음으로 바꾼다. PC 도구는 절대 경로를 쓰므로 인자의 상대 출력 경로를 `output` 기준 절대 경로로 바꾸는 `abs`를 끼운다:

```js
    const hasAudio = probe.streams.some(s => s.codec_type === 'audio');
    const args = hlsEncodeArgs(input, r, { preset: 'fast', hdr, hasAudio }).map(a => a.startsWith(`${name}/`) ? join(output, a) : a);
    await ffmpeg(args);
```

`prefix` 변수 선언(`const prefix = hdr ? 'zscale…' : '';`)은 이제 쓰이지 않으므로 지운다. fallback·poster 두 호출도 바꾼다:

```js
  await ffmpeg(fallbackArgs(join(output, fallback.playlist)).map(a => a === 'fallback.mp4' ? join(output, a) : a));
  await ffmpeg(posterArgs(join(output, fallback.playlist)).map(a => a === 'poster.jpg' ? join(output, a) : a));
```

Run: `node --test tests/video-conversion.test.mjs`
Expected: PASS — 산출물(화질·키프레임·무음·회전·HDR)이 그대로다. 실패하면 인자 순서가 아니라 값이 달라진 것이니 `hlsEncodeArgs`를 PC 도구의 원래 인자와 한 줄씩 대조한다.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/video-encode.ts packages/shared/src/video-encode.test.ts scripts/convert-video.mjs
git commit -m "refactor(video): move FFmpeg arguments and stream-dump parsing into shared pure helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 브라우저 변환 모듈과 묶음 검증 분리

**Files:**
- Modify: `apps/admin/package.json` (의존성 추가)
- Modify: `apps/admin/src/lib/video-upload.ts`
- Create: `apps/admin/src/lib/video-convert.ts`

**Interfaces:**
- Consumes: `buildVideoLadder`·`toManifestRendition`·`buildMasterPlaylist` (Task 1), `parseStreamInfo`·`hlsEncodeArgs`·`fallbackArgs`·`posterArgs`·`BROWSER_LIMITS` (Task 3), `parseVideoManifest`·`validateVideoPlaylist` (기존).
- Produces:
  - `validateBundleFiles(bytes: Record<string, Uint8Array>): { manifest: VideoManifest; bytes: Record<string, Uint8Array> }` (video-upload.ts) — ZIP 경로와 변환 경로가 같은 검증을 탄다.
  - `probeVideoFile(file: File): Promise<{ width: number; height: number; durationSec: number }>` (video-convert.ts) — `<video>` 메타데이터.
  - `convertVideoFile(file, opts: { onProgress: (p: ConvertProgress) => void; signal: AbortSignal }): Promise<{ manifest: VideoManifest; bytes: Record<string, Uint8Array> }>`
  - `type ConvertProgress = { stage: "load" | "probe" | "encode" | "finish"; label?: string; index: number; total: number; ratio: number }`
  - `class ConvertError extends Error { hint?: "pc-tool" }` — PC 도구로 안내해야 하는 거부(HDR·상한 초과)는 `hint: "pc-tool"`.

- [ ] **Step 1: 의존성 설치**

```bash
npm install --workspace @ttokttok/admin @ffmpeg/ffmpeg@0.12.15 @ffmpeg/util@0.12.2
```

Expected: `apps/admin/package.json` dependencies에 두 항목이 추가되고 `package-lock.json`이 갱신된다. 코어(`@ffmpeg/core`)는 설치하지 않는다 — CDN에서 받는다(§4.5).

- [ ] **Step 2: 설치된 타입으로 API 이름을 확인한다**

Run: `sed -n 1,80p node_modules/@ffmpeg/ffmpeg/dist/esm/classes.d.ts` 와 `grep -n "load\|exec\|writeFile\|readFile\|createDir\|listDir\|deleteFile\|deleteDir\|terminate\|on(" node_modules/@ffmpeg/ffmpeg/dist/esm/classes.d.ts`
Expected: `load({coreURL, wasmURL})`, `exec(args: string[], timeout?)`→`Promise<number>`, `writeFile(path, data)`, `readFile(path, encoding?)`→`Promise<Uint8Array|string>`, `createDir`, `listDir`→`{name,isDir}[]`, `deleteFile`, `deleteDir`, `terminate()`, `on("log"|"progress", cb)`. 이름이 다르면 아래 코드를 그 이름으로 맞춘다 — 추측으로 진행하지 않는다.

- [ ] **Step 3: `readVideoBundle`에서 검증을 분리한다**

`apps/admin/src/lib/video-upload.ts`의 `readVideoBundle`을 다음 두 함수로 바꾼다(ZIP 해제 부분은 그대로, 검증만 뽑는다):

```ts
/** ZIP·브라우저 변환 두 경로가 같은 검증을 탄다 — manifest·파일 목록·재생 목록. */
export function validateBundleFiles(bytes: Record<string, Uint8Array>) {
  if (!bytes['manifest.json'] || bytes['manifest.json'].length > 512000) throw new Error("변환 도구가 만든 ZIP 파일을 선택하세요.");
  let metadata: unknown;
  try { metadata = JSON.parse(new TextDecoder().decode(bytes['manifest.json'])); }
  catch { throw new Error('영상 묶음 정보가 손상되었습니다. PC 변환 도구에서 다시 만들어 주세요.'); }
  const manifest = parseVideoManifest(metadata);
  const allowed = new Set(['manifest.json', ...manifest.files.map(f => f.path)]);
  const names = Object.keys(bytes);
  if (names.length !== allowed.size || names.some(name => !allowed.has(name))) throw new Error("묶음에 허용되지 않는 파일이 있습니다.");
  for (const f of manifest.files) {
    if (bytes[f.path]?.length !== f.size) throw new Error(`파일 누락 또는 크기 불일치: ${f.path}`);
    if (f.path.endsWith('.m3u8')) validateVideoPlaylist(f.path, new TextDecoder().decode(bytes[f.path]), manifest);
  }
  return { manifest, bytes };
}

export async function readVideoBundle(file: File) {
  if (file.size > VIDEO_BUNDLE_LIMIT + 1024 * 1024) throw new Error("ZIP 파일은 512MB 이하여야 합니다.");
  let expanded = 0, entries = 0;
  const bytes = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    file.arrayBuffer().then(buffer => unzip(new Uint8Array(buffer), {
      filter(entry) {
        expanded += entry.originalSize; entries++;
        return entries <= 1501 && expanded <= VIDEO_BUNDLE_LIMIT + 512000 && entry.originalSize <= VIDEO_FILE_LIMIT;
      },
    }, (err, data) => err ? reject(new Error('ZIP 파일을 읽을 수 없습니다. PC 변환 도구에서 다시 만들어 주세요.')) : resolve(data))).catch(reject);
  });
  if (expanded > VIDEO_BUNDLE_LIMIT + 512000 || entries > 1501) throw new Error("압축 해제 크기가 제한을 초과했습니다.");
  return validateBundleFiles(bytes);
}
```

(원래 `readVideoBundle` 안에 있던 `entries !== allowed.size` 검사는 `names.length !== allowed.size`로 같은 뜻이다 — unzip 결과의 키 수가 곧 엔트리 수다.)

Run: `npx vitest run` 과 `npm run typecheck`
Expected: 통과 (호출부 `video-bundle-field.tsx`는 시그니처가 같아 그대로다).

- [ ] **Step 4: 변환 모듈을 쓴다**

`apps/admin/src/lib/video-convert.ts`:

```ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { BROWSER_LIMITS, fallbackArgs, hlsEncodeArgs, parseStreamInfo, posterArgs } from "@ttokttok/shared/video-encode";
import { buildMasterPlaylist, buildVideoLadder, toManifestRendition } from "@ttokttok/shared/video-ladder";
import type { VideoManifest } from "@ttokttok/shared/video-bundle";
import { validateBundleFiles } from "@/lib/video-upload";

/**
 * 브라우저 안에서 mp4를 HLS 묶음으로 변환한다 (설계 §4).
 *
 * 산출물은 PC 도구(scripts/convert-video.mjs)와 파일 단위로 같다 — 사다리·
 * 인코딩 인자·마스터 재생 목록이 전부 packages/shared의 같은 함수에서 나온다.
 * 결과는 readVideoBundle과 같은 { manifest, bytes } 모양이라, 그 뒤 업로드·
 * 서버 검증은 ZIP을 올렸을 때와 한 줄도 다르지 않다.
 *
 * 코어(GPL)는 jsdelivr에서 버전 고정으로 받는다. 워커가 blob URL에서 뜨므로
 * CORS 설정이 필요 없다. 단일 스레드라 느리다 — 상한은 BROWSER_LIMITS.
 */
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

export type ConvertProgress = {
  stage: "load" | "probe" | "encode" | "finish";
  /** encode 단계의 화질 라벨. */
  label?: string;
  /** encode 단계: 몇 번째 화질인가 (1부터). */
  index: number;
  total: number;
  /** 현재 단계 안의 진행률 0~1. */
  ratio: number;
};

export class ConvertError extends Error {
  hint?: "pc-tool";
  constructor(message: string, hint?: "pc-tool") {
    super(message);
    this.hint = hint;
  }
}

const PC_TOOL = " PC 변환 도구(scripts/convert-video.cmd)로 만든 ZIP을 올려 주세요.";

/** <video> 메타데이터로 표시 크기·길이를 읽는다. 회전은 브라우저가 이미 반영한다. */
export function probeVideoFile(file: File): Promise<{ width: number; height: number; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = () => { URL.revokeObjectURL(url); video.removeAttribute("src"); video.load(); };
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, durationSec: video.duration };
      done();
      if (!result.width || !result.height || !Number.isFinite(result.durationSec)) reject(new ConvertError("영상 정보를 읽을 수 없습니다. mp4(H.264) 파일인지 확인하세요."));
      else resolve(result);
    };
    video.onerror = () => { done(); reject(new ConvertError("브라우저가 이 영상을 열 수 없습니다." + PC_TOOL, "pc-tool")); };
    video.src = url;
  });
}

function checkLimits(file: File, durationSec: number) {
  if (file.size > BROWSER_LIMITS.maxFileBytes)
    throw new ConvertError(`브라우저 변환은 ${Math.round(BROWSER_LIMITS.maxFileBytes / 1024 / 1024)}MB 이하 파일만 받습니다.` + PC_TOOL, "pc-tool");
  if (durationSec > BROWSER_LIMITS.maxDurationSec)
    throw new ConvertError(`브라우저 변환은 ${BROWSER_LIMITS.maxDurationSec}초 이하 영상만 받습니다.` + PC_TOOL, "pc-tool");
}

async function readDirFiles(ffmpeg: FFmpeg, dir: string): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await ffmpeg.listDir(dir)) {
    if (entry.isDir) continue;
    const data = await ffmpeg.readFile(`${dir}/${entry.name}`);
    out[`${dir}/${entry.name}`] = typeof data === "string" ? new TextEncoder().encode(data) : data;
  }
  return out;
}

export async function convertVideoFile(
  file: File,
  opts: { onProgress: (p: ConvertProgress) => void; signal: AbortSignal },
): Promise<{ manifest: VideoManifest; bytes: Record<string, Uint8Array> }> {
  const probe = await probeVideoFile(file);
  checkLimits(file, probe.durationSec);
  const ladder = buildVideoLadder(probe.width, probe.height);
  const renditions = ladder.renditions.filter((r) => Number(r.label.replace("p", "")) <= BROWSER_LIMITS.maxLevel);
  const fallback = renditions.includes(ladder.fallback) ? ladder.fallback : renditions[renditions.length - 1];
  const total = renditions.length;

  const ffmpeg = new FFmpeg();
  const logs: string[] = [];
  ffmpeg.on("log", ({ message }) => { logs.push(message); if (logs.length > 400) logs.shift(); });
  const abort = () => ffmpeg.terminate();
  opts.signal.addEventListener("abort", abort, { once: true });
  const aborted = () => { if (opts.signal.aborted) throw new ConvertError("변환을 중단했습니다."); };

  try {
    opts.onProgress({ stage: "load", index: 0, total, ratio: 0 });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    aborted();
    await ffmpeg.writeFile("input", new Uint8Array(await file.arrayBuffer()));

    // 스트림 덤프 — 출력이 없어 종료 코드는 0이 아니지만 로그는 찍힌다.
    opts.onProgress({ stage: "probe", index: 0, total, ratio: 0 });
    logs.length = 0;
    await ffmpeg.exec(["-i", "input"]);
    const info = parseStreamInfo(logs);
    if (!info.hasVideo) throw new ConvertError("영상 스트림이 없는 파일입니다.");
    if (info.hdr) throw new ConvertError("HDR 영상은 브라우저에서 변환할 수 없습니다." + PC_TOOL, "pc-tool");
    aborted();

    let current = 0;
    ffmpeg.on("progress", ({ progress }) => {
      opts.onProgress({ stage: "encode", label: renditions[current]?.label, index: current + 1, total, ratio: Math.min(1, Math.max(0, progress)) });
    });
    for (const [i, r] of renditions.entries()) {
      current = i;
      opts.onProgress({ stage: "encode", label: r.label, index: i + 1, total, ratio: 0 });
      await ffmpeg.createDir(r.label);
      const code = await ffmpeg.exec(hlsEncodeArgs("input", r, { preset: BROWSER_LIMITS.preset, hdr: false, hasAudio: info.hasAudio }));
      aborted();
      if (code !== 0) throw new ConvertError(`${r.label} 변환에 실패했습니다: ${logs.filter((l) => /error/i.test(l)).slice(-1)[0] ?? `ffmpeg 종료 ${code}`}`);
    }

    opts.onProgress({ stage: "finish", index: total, total, ratio: 0 });
    if ((await ffmpeg.exec(fallbackArgs(fallback.playlist))) !== 0) throw new ConvertError("호환 mp4 생성에 실패했습니다.");
    if ((await ffmpeg.exec(posterArgs(fallback.playlist))) !== 0) throw new ConvertError("첫 화면 이미지 생성에 실패했습니다.");
    aborted();

    const bytes: Record<string, Uint8Array> = {};
    for (const r of renditions) Object.assign(bytes, await readDirFiles(ffmpeg, r.label));
    for (const name of ["fallback.mp4", "poster.jpg"]) {
      const data = await ffmpeg.readFile(name);
      bytes[name] = typeof data === "string" ? new TextEncoder().encode(data) : data;
    }
    bytes["master.m3u8"] = new TextEncoder().encode(buildMasterPlaylist(renditions));
    const files = Object.entries(bytes).map(([path, data]) => ({ path, size: data.length }));
    const manifest = {
      version: 1 as const,
      duration: probe.durationSec,
      master: "master.m3u8" as const,
      fallback: "fallback.mp4" as const,
      poster: "poster.jpg" as const,
      renditions: renditions.map(toManifestRendition),
      files,
    };
    bytes["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    opts.onProgress({ stage: "finish", index: total, total, ratio: 1 });
    // ZIP과 같은 검증 — 여기서 걸리면 우리 산출물이 우리 규칙을 어긴 것이다.
    return validateBundleFiles(bytes);
  } finally {
    opts.signal.removeEventListener("abort", abort);
    try { ffmpeg.terminate(); } catch { /* 이미 종료됨 */ }
  }
}
```

**주의:** `manifest.duration`은 zod가 `positive().max(600)`으로 검사한다. `files`에는 `manifest.json` 자신을 넣지 않는다(PC 도구와 같다). `readFile`의 반환이 `FileData(Uint8Array | string)`인 것은 Step 2에서 확인한 타입에 맞춘 처리다.

- [ ] **Step 5: 타입·빌드 확인**

Run: `npm run typecheck`
Expected: 통과. `@ffmpeg/ffmpeg` 타입에서 `listDir`·`readFile` 반환 타입이 다르면 Step 2의 실제 선언에 맞춰 고친다.

- [ ] **Step 6: 커밋**

```bash
git add apps/admin/package.json package-lock.json apps/admin/src/lib/video-upload.ts apps/admin/src/lib/video-convert.ts
git commit -m "feat(admin): convert mp4 to the HLS bundle in the browser with ffmpeg.wasm

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 업로드 칸이 mp4를 받고 「변환」을 제공한다

**Files:**
- Modify: `apps/admin/src/components/admin/video-bundle-field.tsx`
- Modify: `e2e/admin.video.spec.ts` (라벨 3곳)

**Interfaces:**
- Consumes: `convertVideoFile`·`probeVideoFile`·`ConvertError`·`ConvertProgress` (Task 4), `readVideoBundle` (기존).
- Produces: 컴포넌트 시그니처는 그대로 — `VideoBundleField({ existing, onReadyChange })`. 숨은 필드 `video_upload_id` 그대로. 라벨 「영상 파일 또는 변환한 ZIP」, 버튼 「변환」/「변환 중단」.

- [ ] **Step 1: 컴포넌트를 바꾼다**

`apps/admin/src/components/admin/video-bundle-field.tsx`의 `VideoBundleField` 함수 전체를 다음으로 교체한다(위쪽 `Preview`와 import는 유지하고, import에 `convertVideoFile, probeVideoFile, ConvertError` 와 `type ConvertProgress` 를 `@/lib/video-convert`에서 추가한다):

```tsx
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const isVideoFile = (file: File) => VIDEO_TYPES.includes(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);

function progressText(p: ConvertProgress) {
  if (p.stage === "load") return "변환 도구를 내려받는 중 (처음 한 번, 약 30MB)";
  if (p.stage === "probe") return "영상 정보를 읽는 중";
  if (p.stage === "encode") return `${p.label} 변환 중 (${p.index}/${p.total}) · ${Math.round(p.ratio * 100)}%`;
  return p.ratio >= 1 ? "변환 완료" : "호환 영상과 첫 화면 만드는 중";
}

export function VideoBundleField({ existing, onReadyChange }: { existing: boolean; onReadyChange: (ready: boolean) => void }) {
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof readVideoBundle>> | null>(null);
  const [source, setSource] = useState<{ file: File; width: number; height: number; durationSec: number } | null>(null);
  const [converting, setConverting] = useState<ConvertProgress | null>(null);
  const [session, setSession] = useState<{ id: string; base: string } | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [progress, setProgress] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const completed = useRef(new Set<string>()), abort = useRef<AbortController | null>(null);
  const convertAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); convertAbort.current?.abort(); }, []);
  useEffect(() => () => { if (poster) URL.revokeObjectURL(poster); }, [poster]);
  const total = bundle?.manifest.files.reduce((n, f) => n + f.size, 0) ?? 0;

  function reset(file: File | undefined) {
    setBundle(null); setSource(null); setConverting(null); setSession(null); setReady(false); setError(''); setProgress(0); setPoster(null); completed.current = new Set();
    onReadyChange(!file && existing);
  }
  function adopt(parsed: Awaited<ReturnType<typeof readVideoBundle>>) {
    setBundle(parsed);
    setPoster(URL.createObjectURL(new Blob([new Uint8Array(parsed.bytes[parsed.manifest.poster])], { type: 'image/jpeg' })));
  }
  async function convert() {
    if (!source) return;
    const control = new AbortController(); convertAbort.current = control;
    setError(''); setBusy(true);
    try {
      const parsed = await convertVideoFile(source.file, { signal: control.signal, onProgress: setConverting });
      adopt(parsed);
    } catch (e) {
      setConverting(null);
      setError(e instanceof Error ? e.message : '변환에 실패했습니다.');
    } finally { setBusy(false); convertAbort.current = null; }
  }
  async function upload() {
    if (!bundle) return;
    setBusy(true); setError(''); onReadyChange(false);
    const control = new AbortController(); abort.current = control;
    try {
      const current = session ?? await videoUploadRequest({ action: 'start', manifest: bundle.manifest });
      setSession(current);
      await uploadVideoFiles({ id: current.id, ...bundle, completed: completed.current, signal: control.signal, onProgress: setProgress });
      if (control.signal.aborted) throw new Error('업로드를 중단했습니다.');
      await videoUploadRequest({ action: 'complete', id: current.id });
      setReady(true); onReadyChange(true);
    } catch (e) { setError(e instanceof Error ? e.message : '업로드에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-3">
    <Label htmlFor="video-bundle">영상 파일 또는 변환한 ZIP</Label>
    <Input id="video-bundle" type="file" accept=".zip,application/zip,.mp4,.mov,.m4v,video/mp4,video/quicktime" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0];
      reset(file);
      if (!file) return;
      setBusy(true);
      try {
        if (isVideoFile(file)) {
          const info = await probeVideoFile(file);
          setSource({ file, ...info });
        } else {
          adopt(await readVideoBundle(file));
        }
      } catch (e) { setError(e instanceof Error ? e.message : '파일을 확인하지 못했습니다.'); }
      finally { setBusy(false); }
    }} />
    <input type="hidden" name="video_upload_id" value={ready ? session?.id ?? '' : ''} />
    <p className="text-muted-foreground text-xs">mp4·mov를 고르면 브라우저 안에서 화질별로 변환합니다(길이 {Math.round(180)}초 이하 권장 30~60초). 긴 영상·HDR은 PC 변환 도구의 ZIP을 올리세요.{existing ? ' 새 파일을 선택하지 않으면 현재 영상을 유지합니다.' : ''}</p>
    {source && !bundle ? <>
      <p className="text-sm">{source.width}×{source.height} · {Math.ceil(source.durationSec)}초 · {(source.file.size / 1024 / 1024).toFixed(1)}MB</p>
      {converting ? <>
        <progress aria-label="영상 변환 진행률" value={converting.stage === 'encode' ? (converting.index - 1 + converting.ratio) / converting.total : converting.stage === 'finish' ? 1 : 0} max={1} className="w-full" />
        <p role="status" className="text-sm">{progressText(converting)}</p>
      </> : null}
      {!busy ? <Button type="button" variant="secondary" onClick={convert}>변환</Button> : null}
      {busy && converting ? <Button type="button" variant="outline" onClick={() => convertAbort.current?.abort()}>변환 중단</Button> : null}
    </> : null}
    {bundle ? <>
      <p className="text-sm">{bundle.manifest.renditions.map(r => r.label).join(' · ')} · {Math.ceil(bundle.manifest.duration)}초 · {(total / 1024 / 1024).toFixed(1)}MB{source ? ' · 변환 완료' : ''}</p>
      {!ready && poster ? <Image unoptimized src={poster} alt="영상 첫 화면" sizes="(max-width: 640px) 100vw, 640px" width={bundle.manifest.renditions[0].width} height={bundle.manifest.renditions[0].height} className="max-h-64 w-full rounded-md object-contain" /> : null}
      <progress aria-label="영상 업로드 진행률" value={progress} max={total} className="w-full" />
      <p role="status" className="text-sm">{ready ? '업로드 확인 완료. 발행하거나 임시저장하세요.' : `${Math.round(progress / total * 100)}% 업로드${busy && progress === total ? ' · 파일 확인 중' : ''}`}</p>
      {!ready && !busy ? <Button type="button" variant="secondary" onClick={upload}>{session ? '실패한 파일 이어 올리기' : '영상 업로드'}</Button> : null}
      {busy && !converting ? <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>업로드 중단</Button> : null}
      {ready && session ? <Preview base={session.base} renditions={bundle.manifest.renditions} /> : null}
    </> : null}
    {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
    <a href="/admin/videos" className="text-muted-foreground text-xs underline">업로드 기록과 미사용 파일 관리</a>
  </div>;
}
```

안내 문구의 `{Math.round(180)}`는 `BROWSER_LIMITS.maxDurationSec`으로 바꾼다(`@ttokttok/shared/video-encode`에서 import). 상한이 코드와 문구에서 두 번 적히지 않게 한다.

- [ ] **Step 2: 기존 E2E 라벨을 갱신한다**

`e2e/admin.video.spec.ts`의 세 곳 `getByLabel('변환한 영상 ZIP')`을 `getByLabel('영상 파일 또는 변환한 ZIP')`으로 바꾼다:

```bash
sed -i "s/getByLabel('변환한 영상 ZIP')/getByLabel('영상 파일 또는 변환한 ZIP')/g" e2e/admin.video.spec.ts
grep -n "영상 파일 또는 변환한 ZIP" e2e/admin.video.spec.ts
```

Expected: 3줄(14·89·98).

- [ ] **Step 3: 타입·빌드·375px 확인**

Run: `npm run typecheck && npm run build:admin`
Expected: 통과.

Run (프로덕션 빌드를 테스트 포트로): 격리 DB가 떠 있어야 한다 — `docker ps --format "{{.Names}}" | grep supabase_db_ttokttok-e2e`. 없으면 `npm run test:db` 뒤 `npm run test:seed`. 그 뒤 `npm run test:build` 와 `node scripts/serve-test.mjs admin`(별 터미널) → Playwright 스크립트로 `http://localhost:3004/admin/posts/new?type=video`를 375px로 열어 `.tmp/spike/sample-1080p-60s.mp4`(Task 2)를 넣고 「변환」을 눌러 진행률 문구가 바뀌고 「변환 완료」 뒤 포스터·「영상 업로드」가 보이는지 스크린샷으로 확인한다(`e2e/helpers.ts`의 `authenticate` 패턴으로 관리자 쿠키를 심는다). 확인한 스크린샷은 `.tmp/`에 둔다.

Expected: 변환 완료 문구와 포스터가 보인다. 실패 문구가 보이면 콘솔 로그의 ffmpeg 오류 줄을 읽고 Task 4의 인자를 고친다.

- [ ] **Step 4: 기존 영상 E2E로 ZIP 경로 회귀 확인**

Run: `npx playwright test e2e/admin.video.spec.ts`
Expected: PASS(기존 두 테스트). 실패하면 라벨·`accept` 변경 외에 ZIP 경로 동작이 달라졌는지 본다.

- [ ] **Step 5: 커밋**

```bash
git add apps/admin/src/components/admin/video-bundle-field.tsx e2e/admin.video.spec.ts
git commit -m "feat(admin): accept mp4 in the video field and convert it in the browser before upload

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 마이그레이션 — `book_trailers`·RPC·정리 규칙, 격리 DB 테스트

**Files:**
- Create: `supabase/migrations/20260912000003_book_trailers.sql`
- Regenerate: `packages/database/src/types.ts`
- Create: `tests/live-db/book-trailers.test.ts`
- Modify: `tests/live-db/video-bundles.test.ts` (독점 케이스 한 줄)

**Interfaces:**
- Produces:
  - 표 `public.book_trailers(book_id PK, source_type, video_path, youtube_id, duration_sec, hls_path, poster_path, renditions, asset_group_id, created_at)`.
  - RPC `save_book_trailer(p_book_id uuid, p_source text, p_youtube_id text default null, p_upload_id uuid default null) returns void` — `p_source ∈ {'none','youtube','upload'}`.
  - `save_video_post`·`claim_video_cleanup`이 트레일러 참조를 존중한다.

- [ ] **Step 1: 실패하는 격리 DB 테스트를 쓴다**

`tests/live-db/book-trailers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { account, serviceDb, publicDb, ids, check } from './fixtures.ts';

const YT = 'dQw4w9WgXcQ';

test('book trailer: permission, verified bundle, exclusivity with posts, source switching, cleanup lock, cascade', async () => {
  const { db: admin, user } = await account('admin');
  const { db: reader } = await account('user');
  const service = serviceDb();
  const group = crypto.randomUUID();
  const file = `bundles/${group}/test.ts`;
  const bookId = crypto.randomUUID();
  let post: string | undefined;
  check(await service.from('books').insert({ id: bookId, title: '트레일러 테스트', author: '테스트 작가', category: '소설', isbn: '9788900000001' }));
  check(await service.from('video_uploads').insert({ id: group, created_by: user.id, manifest: { duration: 6, renditions: [{ label: '480p', width: 480, height: 852, bandwidth: 1, playlist: '480p/index.m3u8' }] }, public_base: `https://example.test/${group}` }));
  try {
    const yt = { p_book_id: bookId, p_source: 'youtube', p_youtube_id: YT };
    assert.ok((await reader.rpc('save_book_trailer', yt)).error, 'reader rejected');
    assert.ok((await publicDb().rpc('save_book_trailer', yt)).error, 'anon rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'youtube', p_youtube_id: 'short' })).error, 'bad youtube id rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: crypto.randomUUID(), p_source: 'youtube', p_youtube_id: YT })).error, 'unknown book rejected');

    check(await admin.rpc('save_book_trailer', yt));
    let row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.source_type, 'youtube'); assert.equal(row.youtube_id, YT); assert.equal(row.asset_group_id, null);
    // 읽기는 공개다 — 다음 단계(도서 시트)가 anon으로 읽는다.
    assert.equal(check(await publicDb().from('book_trailers').select('youtube_id').eq('book_id', bookId).single()).data.youtube_id, YT);

    const up = { p_book_id: bookId, p_source: 'upload', p_upload_id: group };
    assert.ok((await admin.rpc('save_book_trailer', up)).error, 'unverified bundle rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'upload' })).error, 'upload without bundle and without previous upload rejected');
    check(await admin.storage.from('videos').upload(file, new Uint8Array([1, 2, 3]), { contentType: 'video/mp2t' }));
    check(await service.from('video_uploads').update({ status: 'ready' }).eq('id', group));

    // 게시물이 먼저 쓴 묶음은 트레일러에 못 붙인다.
    post = check(await admin.rpc('save_video_post', { p_id: null, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'upload', p_upload_id: group })).data;
    assert.ok((await admin.rpc('save_book_trailer', up)).error, 'bundle attached to a post is rejected for a trailer');
    check(await admin.rpc('save_video_post', { p_id: post, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'youtube', p_youtube_id: YT }));

    check(await admin.rpc('save_book_trailer', up));
    row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.source_type, 'upload'); assert.equal(row.youtube_id, null);
    assert.equal(row.hls_path, `https://example.test/${group}/master.m3u8`);
    assert.equal(row.video_path, `https://example.test/${group}/fallback.mp4`);
    assert.equal(row.poster_path, `https://example.test/${group}/poster.jpg`);
    assert.equal(row.duration_sec, 6); assert.equal(row.asset_group_id, group);

    // 트레일러가 쓰는 묶음은 게시물에 못 붙이고, 정리도 못 한다.
    assert.ok((await admin.rpc('save_video_post', { p_id: post, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'upload', p_upload_id: group })).error, 'bundle attached to a trailer is rejected for a post');
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, false, 'cleanup locked while trailer references the bundle');
    // 같은 도서에 upload_id 없이 다시 저장하면 기존 영상을 유지한다.
    check(await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'upload' }));
    assert.equal(check(await service.from('book_trailers').select('asset_group_id').eq('book_id', bookId).single()).data.asset_group_id, group);
    // 다른 도서는 같은 묶음을 못 쓴다.
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: ids.linkBook, p_source: 'upload', p_upload_id: group })).error, 'bundle is exclusive to one trailer');

    // youtube로 돌리면 업로드 필드가 비고, 묶음은 정리 가능해진다.
    check(await admin.rpc('save_book_trailer', yt));
    row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.asset_group_id, null); assert.equal(row.hls_path, null); assert.equal(row.renditions, null);
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, true);
    check(await service.from('video_uploads').update({ status: 'ready' }).eq('id', group)); // 다음 단언을 위해 되돌린다

    // none → 행 삭제. 도서 삭제 → cascade.
    check(await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'none' }));
    assert.equal((await service.from('book_trailers').select('book_id').eq('book_id', bookId).maybeSingle()).data, null);
    check(await admin.rpc('save_book_trailer', yt));
    check(await service.from('books').delete().eq('id', bookId));
    assert.equal((await service.from('book_trailers').select('book_id').eq('book_id', bookId).maybeSingle()).data, null, 'cascade on book delete');
  } finally {
    if (post) check(await service.from('posts').delete().eq('id', post));
    await service.from('books').delete().eq('id', bookId);
    check(await service.from('video_uploads').delete().eq('id', group));
    check(await service.storage.from('videos').remove([file]));
  }
});
```

- [ ] **Step 2: 격리 DB 상태를 확인하고 테스트가 실패하는 것을 본다**

```bash
docker ps --format "{{.Names}} {{.Status}}" | grep ttokttok-e2e
```

Expected: `supabase_db_ttokttok-e2e Up …` 등. 없으면 `npm run test:db && npm run test:seed`(운영 DB에 붙지 않는다 — `.env.test`의 URL이 `http://127.0.0.1:54421`인지 `loadTestEnv`가 검사한다).

Run: `node --conditions=react-server --import tsx --test tests/live-db/book-trailers.test.ts`
Expected: FAIL — `save_book_trailer` 함수 없음(PGRST202) 또는 `book_trailers` 표 없음.

- [ ] **Step 3: 마이그레이션을 쓴다**

`supabase/migrations/20260912000003_book_trailers.sql`:

```sql
-- ============================================================
-- 도서 트레일러 — 도서당 하나, post_videos와 같은 모양
-- 설계: docs/superpowers/specs/2026-09-12-book-trailer-design.md
-- ============================================================
create table public.book_trailers (
  book_id uuid primary key references public.books (id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'youtube')),
  video_path text,           -- upload: fallback.mp4 공개 URL (이름과 달리 경로가 아니다 — post_videos와 같다)
  youtube_id text,           -- youtube
  duration_sec int,
  hls_path text,
  poster_path text,
  renditions jsonb,
  asset_group_id uuid references public.video_uploads (id),
  created_at timestamptz not null default now(),
  check (
    (source_type = 'upload' and video_path is not null)
    or (source_type = 'youtube' and youtube_id is not null)
  )
);
create index book_trailers_asset_group_idx on public.book_trailers (asset_group_id);

alter table public.book_trailers enable row level security;
-- 도서 자체가 공개 데이터다. 다음 단계(도서 시트 노출)가 anon으로 읽는다.
create policy book_trailers_select_all on public.book_trailers
  for select using (true);
create policy book_trailers_admin_write on public.book_trailers
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 저장 RPC — save_video_post와 같은 규칙. 묶음은 서버가 ready로 확인한
-- 것만, 그리고 게시물·다른 트레일러 어디에도 붙지 않은 것만 연결한다.
-- ------------------------------------------------------------
create function public.save_book_trailer(
  p_book_id uuid, p_source text, p_youtube_id text default null, p_upload_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  bundle public.video_uploads;
  previous public.book_trailers;
begin
  if not public.is_admin() then raise exception '관리자만 저장할 수 있습니다'; end if;
  if p_source is null or p_source not in ('none', 'upload', 'youtube') then raise exception '잘못된 트레일러 소스'; end if;
  perform 1 from public.books where id = p_book_id for update;
  if not found then raise exception '도서를 찾지 못했습니다'; end if;
  select * into previous from public.book_trailers where book_id = p_book_id;

  if p_source = 'none' then
    delete from public.book_trailers where book_id = p_book_id;
    return;
  end if;

  if p_source = 'youtube' then
    if p_youtube_id is null or p_youtube_id !~ '^[a-zA-Z0-9_-]{11}$' then raise exception '잘못된 유튜브 ID'; end if;
    insert into public.book_trailers (book_id, source_type, youtube_id)
    values (p_book_id, 'youtube', p_youtube_id)
    on conflict (book_id) do update set source_type = 'youtube', youtube_id = excluded.youtube_id,
      video_path = null, hls_path = null, poster_path = null, duration_sec = null, renditions = null, asset_group_id = null;
    return;
  end if;

  -- upload
  if p_upload_id is null then
    if previous.source_type is distinct from 'upload' or previous.video_path is null then
      raise exception '영상 묶음을 업로드하세요';
    end if;
    return; -- 기존 영상 유지
  end if;
  select * into bundle from public.video_uploads where id = p_upload_id for update;
  if not found or bundle.status <> 'ready' then raise exception '업로드 검증이 완료되지 않았습니다'; end if;
  if exists (select 1 from public.post_videos where asset_group_id = p_upload_id) then
    raise exception '게시물에 연결된 영상입니다';
  end if;
  if exists (select 1 from public.book_trailers where asset_group_id = p_upload_id and book_id <> p_book_id) then
    raise exception '다른 도서의 트레일러에 연결된 영상입니다';
  end if;
  insert into public.book_trailers (book_id, source_type, video_path, hls_path, poster_path, duration_sec, renditions, asset_group_id)
  values (p_book_id, 'upload', bundle.public_base || '/fallback.mp4', bundle.public_base || '/master.m3u8',
    bundle.public_base || '/poster.jpg', ceil((bundle.manifest->>'duration')::numeric), bundle.manifest->'renditions', bundle.id)
  on conflict (book_id) do update set source_type = 'upload', youtube_id = null, video_path = excluded.video_path,
    hls_path = excluded.hls_path, poster_path = excluded.poster_path, duration_sec = excluded.duration_sec,
    renditions = excluded.renditions, asset_group_id = excluded.asset_group_id;
end;
$$;
revoke all on function public.save_book_trailer(uuid, text, text, uuid) from public, anon;
grant execute on function public.save_book_trailer(uuid, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 게시물 저장도 트레일러가 쓰는 묶음을 거부한다. 본문은 20260911000001과
-- 같고 검사 한 줄만 늘었다.
-- ------------------------------------------------------------
create or replace function public.save_video_post(
  p_id uuid, p_channel_id uuid, p_book_id uuid, p_publish boolean,
  p_source text, p_youtube_id text default null, p_upload_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(p_id, gen_random_uuid());
  bundle public.video_uploads;
  previous public.post_videos;
begin
  if not public.is_admin() then raise exception '관리자만 저장할 수 있습니다'; end if;
  if p_source is null or p_source not in ('upload', 'youtube') then raise exception '잘못된 영상 소스'; end if;
  if p_id is not null then
    perform 1 from public.posts where id = p_id and type = 'video' for update;
    if not found then raise exception '영상 게시물을 찾지 못했습니다'; end if;
    select * into previous from public.post_videos where post_id = target;
  end if;
  if p_source = 'youtube' and (p_youtube_id is null or p_youtube_id !~ '^[a-zA-Z0-9_-]{11}$') then
    raise exception '잘못된 유튜브 ID';
  end if;
  if p_source = 'upload' then
    if p_upload_id is not null then
      select * into bundle from public.video_uploads where id = p_upload_id for update;
      if not found or bundle.status <> 'ready' then raise exception '업로드 검증이 완료되지 않았습니다'; end if;
      if exists(select 1 from public.post_videos where asset_group_id = p_upload_id and post_id <> target) then
        raise exception '다른 게시물에 연결된 영상입니다';
      end if;
      if exists(select 1 from public.book_trailers where asset_group_id = p_upload_id) then
        raise exception '트레일러에 연결된 영상입니다';
      end if;
    elsif previous.source_type is distinct from 'upload' or previous.video_path is null then
      raise exception '영상 묶음을 업로드하세요';
    end if;
  end if;
  insert into public.posts (id, channel_id, book_id, type, status, published_at)
    values (target, p_channel_id, p_book_id, 'video', case when p_publish then 'published' else 'draft' end, case when p_publish then now() end)
  on conflict (id) do update set channel_id = excluded.channel_id, book_id = excluded.book_id,
    status = excluded.status, published_at = coalesce(posts.published_at, excluded.published_at);
  if p_source = 'youtube' then
    insert into public.post_videos(post_id, source_type, youtube_id) values(target, 'youtube', p_youtube_id)
    on conflict(post_id) do update set source_type = 'youtube', youtube_id = excluded.youtube_id,
      video_path = null, hls_path = null, poster_path = null, duration_sec = null, renditions = null, asset_group_id = null;
  elsif p_upload_id is not null then
    insert into public.post_videos(post_id, source_type, video_path, hls_path, poster_path, duration_sec, renditions, asset_group_id)
    values(target, 'upload', bundle.public_base || '/fallback.mp4', bundle.public_base || '/master.m3u8',
      bundle.public_base || '/poster.jpg', ceil((bundle.manifest->>'duration')::numeric), bundle.manifest->'renditions', bundle.id)
    on conflict(post_id) do update set source_type = 'upload', youtube_id = null, video_path = excluded.video_path,
      hls_path = excluded.hls_path, poster_path = excluded.poster_path, duration_sec = excluded.duration_sec,
      renditions = excluded.renditions, asset_group_id = excluded.asset_group_id;
  end if;
  return target;
end;
$$;

-- 정리 잠금도 트레일러 참조를 본다. 빠뜨리면 정리 화면이 트레일러 영상을 지운다.
create or replace function public.claim_video_cleanup(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.video_uploads where id = p_id for update;
  if not found then return false; end if;
  if exists(select 1 from public.post_videos where asset_group_id = p_id) then return false; end if;
  if exists(select 1 from public.book_trailers where asset_group_id = p_id) then return false; end if;
  update public.video_uploads set status = 'deleting' where id = p_id;
  return true;
end;
$$;
```

- [ ] **Step 4: 격리 DB에 추가 적용하고 타입을 재생성한다**

`npm run test:db`는 마이그레이션 폴더를 `.tmp/supabase-e2e`로 복사만 하고, 이미 떠 있는 DB에는 새 파일을 적용하지 않는다. 그래서 복사 → `migration up` → 타입 순서다:

```bash
npm run test:db
node node_modules/supabase/dist/supabase.js --workdir .tmp/supabase-e2e migration up --local
node node_modules/supabase/dist/supabase.js --workdir .tmp/supabase-e2e migration list --local | tail -4
npm run db:types
git diff --stat packages/database/src/types.ts
```

Expected: `migration list`에 `20260912000003`이 Local 열에 있고, `types.ts`에 `book_trailers` Row/Insert/Update/Relationships와 `save_book_trailer` Functions 항목이 생긴다. `db reset`은 절대 쓰지 않는다(다른 세션의 데이터가 사라진다).

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --conditions=react-server --import tsx --test tests/live-db/book-trailers.test.ts tests/live-db/video-bundles.test.ts`
Expected: 두 파일 PASS. `video-bundles.test.ts`는 손대지 않았지만 `save_video_post`를 갈아 끼웠으므로 함께 돈다.

- [ ] **Step 6: 타입체크·커밋**

Run: `npm run typecheck`
Expected: 통과.

```bash
git add supabase/migrations/20260912000003_book_trailers.sql packages/database/src/types.ts tests/live-db/book-trailers.test.ts
git commit -m "feat(db): add book_trailers with save_book_trailer and make bundle ownership exclusive across posts and trailers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 도서 폼의 트레일러 섹션과 저장 액션

**Files:**
- Create: `apps/admin/src/components/admin/book-trailer-field.tsx`
- Modify: `apps/admin/src/components/admin/book-form.tsx`
- Modify: `apps/admin/src/app/admin/(dashboard)/books/actions.ts`
- Modify: `apps/admin/src/app/admin/(dashboard)/books/[bookId]/page.tsx`

**Interfaces:**
- Consumes: `VideoBundleField` (Task 5), `save_book_trailer` 타입 (Task 6), `parseYoutubeId`·`youtubeThumbnailUrl` (`@ttokttok/shared/youtube`).
- Produces:
  - `type BookTrailerValues = { source_type: "upload" | "youtube"; youtube_id: string | null; poster_path: string | null; duration_sec: number | null; renditions: unknown }`
  - `BookTrailerField({ trailer }: { trailer: BookTrailerValues | null })` — 폼 필드 `trailer_source`(`none`|`youtube`|`upload`), `trailer_youtube_url`, `video_upload_id`.
  - `BookForm({ book, trailer })` — `trailer?: BookTrailerValues | null`.

- [ ] **Step 1: 트레일러 필드 컴포넌트**

`apps/admin/src/components/admin/book-trailer-field.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import { youtubeThumbnailUrl } from "@ttokttok/shared/youtube";
import { VideoBundleField } from "@/components/admin/video-bundle-field";

export type BookTrailerValues = {
  source_type: "upload" | "youtube";
  youtube_id: string | null;
  poster_path: string | null;
  duration_sec: number | null;
  renditions: unknown;
};

type Source = "none" | "youtube" | "upload";

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * 도서 폼의 트레일러 섹션 (설계 §6.1). 도서당 하나. 「없음」으로 저장하면 제거다.
 *
 * 저장 버튼은 서버 컴포넌트(BookForm)에 있어 이 상태를 넘겨받지 못한다. 그래서
 * 업로드가 끝나기 전의 제출은 여기서 가장 가까운 form의 submit을 가로채 막고,
 * 서버 검증(saveBook)이 최종 방어선이다.
 */
export function BookTrailerField({ trailer }: { trailer: BookTrailerValues | null }) {
  const [source, setSource] = useState<Source>(trailer?.source_type ?? "none");
  const [videoReady, setVideoReady] = useState(trailer?.source_type === "upload");
  const [blocked, setBlocked] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ source, videoReady });
  state.current = { source, videoReady };

  useEffect(() => {
    const form = host.current?.closest("form");
    if (!form) return;
    const guard = (event: Event) => {
      if (state.current.source === "upload" && !state.current.videoReady) {
        event.preventDefault();
        setBlocked(true);
        host.current?.scrollIntoView({ block: "center" });
      }
    };
    form.addEventListener("submit", guard);
    return () => form.removeEventListener("submit", guard);
  }, []);

  const labels = Array.isArray(trailer?.renditions)
    ? (trailer.renditions as { label?: string }[]).map((r) => r.label).filter(Boolean).join(" · ")
    : "";

  return (
    <div ref={host} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="trailer_source">트레일러 소스</Label>
        <select
          id="trailer_source"
          name="trailer_source"
          value={source}
          onChange={(e) => {
            const next = e.target.value as Source;
            setSource(next);
            setBlocked(false);
            setVideoReady(next === "upload" && trailer?.source_type === "upload");
          }}
          className={selectClass}
        >
          <option value="none">없음</option>
          <option value="youtube">유튜브</option>
          <option value="upload">영상 파일</option>
        </select>
      </div>

      {source === "youtube" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="trailer_youtube_url">유튜브 주소 또는 ID</Label>
          <Input
            id="trailer_youtube_url"
            name="trailer_youtube_url"
            defaultValue={trailer?.youtube_id ?? ""}
            placeholder="https://youtu.be/... 또는 영상 ID"
          />
          <p className="text-muted-foreground text-xs">watch·youtu.be·shorts·embed 주소를 모두 인식합니다.</p>
          {trailer?.youtube_id ? (
            <Image
              unoptimized
              src={youtubeThumbnailUrl(trailer.youtube_id)}
              alt="트레일러 썸네일"
              width={160}
              height={120}
              className="w-40 rounded-md object-cover"
            />
          ) : null}
        </div>
      ) : null}

      {source === "upload" ? (
        <div className="flex flex-col gap-3">
          {trailer?.source_type === "upload" && trailer.poster_path ? (
            <div className="flex items-center gap-3">
              <Image unoptimized src={trailer.poster_path} alt="현재 트레일러 첫 화면" width={90} height={160} className="w-[90px] rounded-md object-cover" />
              <p className="text-muted-foreground text-xs">현재 영상 · {labels}{trailer.duration_sec ? ` · ${trailer.duration_sec}초` : ""}</p>
            </div>
          ) : null}
          <VideoBundleField
            existing={trailer?.source_type === "upload"}
            onReadyChange={(ready) => { setVideoReady(ready); if (ready) setBlocked(false); }}
          />
        </div>
      ) : null}

      {blocked ? (
        <p role="alert" className="text-destructive text-sm">영상 업로드를 먼저 완료하세요</p>
      ) : null}
    </div>
  );
}
```

**주의:** `w-[90px]`는 임의 크기라 DESIGN.md 위반이다 — `className="w-24 rounded-md object-cover"`(96px)로 쓰고 `width={96} height={171}`로 맞춘다. 위 코드를 그대로 붙이지 말고 이 줄을 고친다. `Image`는 외부 도메인이라 `unoptimized`를 쓴다(admin `next.config`의 remotePatterns를 건드리지 않는다).

- [ ] **Step 2: 도서 폼에 섹션을 넣는다**

`apps/admin/src/components/admin/book-form.tsx`:

import 추가:

```tsx
import { BookTrailerField, type BookTrailerValues } from "./book-trailer-field";
```

시그니처를 바꾼다:

```tsx
export function BookForm({ book, trailer = null }: { book?: BookFormValues; trailer?: BookTrailerValues | null }) {
```

「본문과 표지」 섹션(`<BookCoverField … />`로 끝나는 `</section>`) 바로 뒤, 「구매 링크」 섹션 앞에 추가:

```tsx
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">트레일러</h2>
          <p className="text-muted-foreground text-xs">
            도서당 하나입니다. 유튜브 주소를 넣거나 mp4를 골라 브라우저에서
            변환해 올립니다. 「없음」으로 저장하면 제거됩니다. 사용자 화면 노출은
            다음 단계입니다.
          </p>
        </div>
        <BookTrailerField trailer={trailer} />
      </section>
```

- [ ] **Step 3: 저장 액션 — 검증은 업로드 전에, RPC는 도서 저장 뒤에**

`apps/admin/src/app/admin/(dashboard)/books/actions.ts`:

import 추가:

```ts
import { parseYoutubeId } from "@ttokttok/shared/youtube";
```

`saveBook` 안, `const values: TablesInsert<"books"> = { … };` 바로 뒤(표지 검증 앞)에 추가:

```ts
  // 트레일러 입력은 어떤 업로드보다 먼저 검증한다 — 표지·EPUB이 올라간 뒤
  // 트레일러 때문에 되돌리는 일이 없게 (설계 §6.2).
  const trailerSource = str(formData, "trailer_source") ?? "none";
  if (!["none", "youtube", "upload"].includes(trailerSource)) {
    redirect("/admin/books?error=트레일러 소스를 골라야 합니다");
  }
  const trailerYoutubeId =
    trailerSource === "youtube"
      ? parseYoutubeId(String(formData.get("trailer_youtube_url") ?? ""))
      : null;
  if (trailerSource === "youtube" && !trailerYoutubeId) {
    redirect("/admin/books?error=유튜브 주소에서 영상 ID를 찾지 못했습니다");
  }
  const trailerUploadId = trailerSource === "upload" ? str(formData, "video_upload_id") : null;
  if (trailerSource === "upload" && !trailerUploadId) {
    // 기존 upload 트레일러가 있을 때만 "유지"가 성립한다.
    const existing = id
      ? await db.from("book_trailers").select("source_type").eq("book_id", id).maybeSingle()
      : { data: null, error: null };
    if (existing.error) redirect("/admin/books?error=트레일러 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    if (existing.data?.source_type !== "upload") {
      redirect("/admin/books?error=영상 업로드를 먼저 완료하세요");
    }
  }
```

`saveBook` 끝부분, 이전 파일 회수(`await removeUploaded(orphans);`) 뒤·`revalidatePath("/admin/books");` 앞에 추가:

```ts
  // 도서가 저장된 뒤에만 부른다. 실패하면 도서는 남고 트레일러만 없다 —
  // 메시지에 그 사실을 적고 수정 화면으로 보내 한 번의 저장으로 재시도하게 한다.
  const { error: trailerError } = await db.rpc("save_book_trailer", {
    p_book_id: bookId,
    p_source: trailerSource,
    p_youtube_id: trailerYoutubeId ?? undefined,
    p_upload_id: trailerUploadId ?? undefined,
  });
  if (trailerError) {
    revalidatePath("/admin/books");
    redirect(
      `/admin/books/${bookId}?error=${encodeURIComponent(
        `도서는 저장했지만 트레일러를 저장하지 못했습니다: ${trailerError.message}`,
      )}`,
    );
  }
```

- [ ] **Step 4: 수정 화면이 트레일러를 읽고 오류 배너를 보인다**

`apps/admin/src/app/admin/(dashboard)/books/[bookId]/page.tsx`:

import 추가:

```tsx
import { AdminNotice } from "@/components/admin/admin-notice";
import type { BookTrailerValues } from "@/components/admin/book-trailer-field";
```

select 문자열 끝에 임베드를 붙인다(1:1 관계라 객체 또는 null로 온다):

```tsx
      "id, title, author, translator, publisher, category, isbn, page_count, pub_date_paper, pub_date_ebook, intro, quote, quote_source, toc, source, rights_note, epub_path, cover_url, cover_design, purchase_links, book_trailers ( source_type, youtube_id, poster_path, duration_sec, renditions )",
```

`<AdminToast …/>` 위에 배너를 추가하고, 폼에 트레일러를 넘긴다:

```tsx
      <AdminNotice error={q(sp.error)} />
```

```tsx
      <BookForm
        book={book as BookFormValues}
        trailer={(book.book_trailers as unknown as BookTrailerValues | null) ?? null}
      />
```

- [ ] **Step 5: 타입·빌드·실제 렌더 확인**

Run: `npm run typecheck && npm run build:admin`
Expected: 통과. `db.rpc("save_book_trailer", …)`의 인자 타입 오류가 나면 Task 6 Step 4의 타입 재생성이 안 된 것이다.

Run: 격리 DB 위에서 `npm run test:build` → `node scripts/serve-test.mjs admin` → Playwright로 관리자 쿠키를 심고(`e2e/helpers.ts`의 `authenticate`) 375px에서 `/admin/books/new`를 열어 「트레일러」 섹션·소스 전환·유튜브 입력이 보이는 스크린샷을 `.tmp/`에 남긴다.

Expected: 섹션이 「본문과 표지」 아래 「구매 링크」 위에 있고, 「영상 파일」을 고르면 Task 5의 업로드 칸이 나타난다.

- [ ] **Step 6: 커밋**

```bash
git add apps/admin/src/components/admin/book-trailer-field.tsx apps/admin/src/components/admin/book-form.tsx "apps/admin/src/app/admin/(dashboard)/books/actions.ts" "apps/admin/src/app/admin/(dashboard)/books/[bookId]/page.tsx"
git commit -m "feat(admin): register a book trailer from the book form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 목록 배지와 업로드 기록의 트레일러 사용처

**Files:**
- Modify: `apps/admin/src/app/admin/(dashboard)/books/page.tsx`
- Modify: `apps/admin/src/app/admin/(dashboard)/videos/page.tsx`

- [ ] **Step 1: 도서 목록 배지**

`books/page.tsx`의 select에 임베드를 붙인다:

```tsx
    .select("id, title, author, category, epub_path, isbn, cover_url, intro, rights_note, book_trailers ( book_id )")
```

「유형」 셀의 `<div className="flex flex-wrap gap-1">` 안, 「미완성」 배지 앞에 추가:

```tsx
                    {b.book_trailers ? <Badge variant="outline">트레일러</Badge> : null}
```

- [ ] **Step 2: 업로드 기록**

`videos/page.tsx`의 본문을 다음으로 바꾼다:

```tsx
export default async function VideosPage() {
  await requireAdmin();
  const db = await createClient();
  const { data, error } = await db.from('video_uploads')
    .select('id, created_at, status, post_videos(post_id), book_trailers(book_id)').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  // 사용처는 게시물 또는 트레일러 중 하나다 — RPC가 묶음을 한 곳에만 붙게 한다.
  const used = new Map<string, { label: string; href: string }>();
  for (const u of data ?? []) {
    if (u.post_videos.length > 0) used.set(u.id, { label: '게시물에서 사용 중', href: `/admin/posts/${u.post_videos[0].post_id}` });
    else if (u.book_trailers.length > 0) used.set(u.id, { label: '트레일러에서 사용 중', href: `/admin/books/${u.book_trailers[0].book_id}` });
  }
  return <div className="flex flex-col gap-6">
    <h1 className="text-xl font-bold">영상 업로드 기록</h1>
    <p className="text-muted-foreground text-sm">최근 100건입니다. 게시물이나 도서 트레일러에 연결된 영상은 삭제할 수 없습니다. 교체 전 영상은 백업과 새 영상 재생을 확인한 후 정리하세요.</p>
    <Link href="/admin/posts" className="underline">게시물 목록</Link>
    {!data?.length ? <p>업로드 기록이 없습니다.</p> : data.map(upload => {
      const use = used.get(upload.id);
      return <section key={upload.id} className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">{new Date(upload.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {use ? use.label : upload.status === 'ready' ? '미사용 · 업로드 완료' : upload.status === 'deleting' ? '삭제 재시도 필요' : '미완료 업로드'}</p>
        <p className="text-muted-foreground break-all text-xs">{upload.id}</p>
        {use ? <Link href={use.href} className="underline">{use.label.startsWith('게시물') ? '게시물 확인' : '도서 확인'}</Link> : <VideoCleanup id={upload.id} />}
      </section>;
    })}
  </div>;
}
```

`video-cleanup.tsx`의 confirm 문구 "게시물에서 사용하지 않는 영상 파일을 삭제합니다."를 "게시물·트레일러에서 사용하지 않는 영상 파일을 삭제합니다."로 바꾼다.

- [ ] **Step 3: 타입·빌드 확인·커밋**

Run: `npm run typecheck && npm run build:admin`
Expected: 통과. `b.book_trailers`가 배열로 추론되면(생성 타입의 `isOneToOne`이 false로 잡힌 경우) `Array.isArray(b.book_trailers) ? b.book_trailers.length > 0 : Boolean(b.book_trailers)`로 판정한다.

```bash
git add "apps/admin/src/app/admin/(dashboard)/books/page.tsx" "apps/admin/src/app/admin/(dashboard)/videos/page.tsx" apps/admin/src/components/admin/video-cleanup.tsx
git commit -m "feat(admin): show trailer usage in the book list and the upload records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: E2E — 유튜브·mp4 변환·제출 가드

**Files:**
- Modify: `e2e/video-fixture.ts` (mp4 픽스처)
- Create: `e2e/admin.trailer.spec.ts`

**Interfaces:**
- Produces: `mp4Fixture(): string` — 3초 360×640 무음 mp4의 절대 경로.

- [ ] **Step 1: mp4 픽스처**

`e2e/video-fixture.ts` 끝에 추가:

```ts
/** 브라우저 변환 E2E용 작은 원본 — 3초·360×640·무음. 사다리는 360p 한 화질이 된다. */
export function mp4Fixture() {
  const file = '.tmp/test-assets/trailer-source.mp4';
  if (!existsSync(file)) {
    mkdirSync('.tmp/test-assets', { recursive: true });
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      'testsrc2=size=360x640:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { windowsHide: true });
  }
  return resolve(file);
}
```

- [ ] **Step 2: E2E 스펙**

`e2e/admin.trailer.spec.ts`:

```ts
import { test, expect, authenticate, serviceDb, check } from './helpers';
import { mp4Fixture } from './video-fixture';

async function fillBook(page: import('@playwright/test').Page, title: string) {
  await page.goto('/admin/books/new');
  await page.getByLabel('제목 *', { exact: true }).fill(title);
  await page.getByLabel('저자 *', { exact: true }).fill('테스트 작가');
  await page.getByLabel('카테고리 *', { exact: true }).fill('소설');
  // EPUB 없이 저장하려면 ISBN이나 구매 링크가 있어야 한다 (books_needs_epub_or_store_ref).
  await page.getByLabel('ISBN', { exact: true }).fill('9788900000002');
}

test('admin trailer: youtube trailer is saved with the book, shown on edit, removed with 없음', async ({ page, context }) => {
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  const db = serviceDb();
  const title = '트레일러 유튜브 도서';
  await db.from('books').delete().eq('title', title);
  try {
    await fillBook(page, title);
    await page.getByLabel('트레일러 소스').selectOption('youtube');
    await page.getByLabel('유튜브 주소 또는 ID').fill('https://youtu.be/dQw4w9WgXcQ');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: title }).getByText('트레일러')).toBeVisible();
    const book = check(await db.from('books').select('id').eq('title', title).single()).data;
    const row = check(await db.from('book_trailers').select('*').eq('book_id', book.id).single()).data;
    expect(row).toMatchObject({ source_type: 'youtube', youtube_id: 'dQw4w9WgXcQ', asset_group_id: null });

    await page.goto(`/admin/books/${book.id}`);
    await expect(page.getByLabel('트레일러 소스')).toHaveValue('youtube');
    await expect(page.getByRole('img', { name: '트레일러 썸네일' })).toHaveAttribute('src', /dQw4w9WgXcQ/);
    await page.getByLabel('트레일러 소스').selectOption('none');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1/);
    expect((await db.from('book_trailers').select('book_id').eq('book_id', book.id).maybeSingle()).data).toBeNull();
  } finally {
    await db.from('books').delete().eq('title', title);
  }
});

test('admin trailer: mp4 is converted in the browser, uploaded and attached', async ({ page, context }) => {
  test.setTimeout(600000);
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  const db = serviceDb();
  const title = '트레일러 변환 도서';
  await db.from('books').delete().eq('title', title);
  let group = '';
  try {
    await fillBook(page, title);
    await page.getByLabel('트레일러 소스').selectOption('upload');
    await page.getByLabel('영상 파일 또는 변환한 ZIP').setInputFiles(mp4Fixture());
    await expect(page.getByText(/360×640 · 3초/)).toBeVisible();
    await page.getByRole('button', { name: '변환', exact: true }).click();
    await expect(page.getByText(/360p .* 변환 완료|변환 완료/)).toBeVisible({ timeout: 480000 });
    await page.getByRole('button', { name: '영상 업로드', exact: true }).click();
    await expect(page.getByText('업로드 확인 완료. 발행하거나 임시저장하세요.')).toBeVisible({ timeout: 120000 });
    group = await page.locator('[name="video_upload_id"]').inputValue();
    expect(group).toMatch(/^[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1/);
    const book = check(await db.from('books').select('id').eq('title', title).single()).data;
    const row = check(await db.from('book_trailers').select('*').eq('book_id', book.id).single()).data;
    expect(row.source_type).toBe('upload');
    expect(row.asset_group_id).toBe(group);
    expect(row.hls_path).toContain(`/bundles/${group}/master.m3u8`);
    expect(row.duration_sec).toBe(3);
    expect((await fetch(row.poster_path!)).status).toBe(200);
    // 사용 중인 묶음은 정리를 거부한다.
    const status = await page.evaluate(async id => (await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', id }) })).status, group);
    expect(status).toBe(400);
  } finally {
    await db.from('books').delete().eq('title', title);
    if (group) await page.evaluate(async id => { await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', id }) }); }, group);
  }
});

test('admin trailer: submitting an upload trailer before the upload finishes is blocked', async ({ page, context }) => {
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  await fillBook(page, '트레일러 가드 도서');
  await page.getByLabel('트레일러 소스').selectOption('upload');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('영상 업로드를 먼저 완료하세요');
  await expect(page).toHaveURL(/\/admin\/books\/new/);
  expect((await serviceDb().from('books').select('id').eq('title', '트레일러 가드 도서').maybeSingle()).data).toBeNull();
});
```

- [ ] **Step 3: 실행**

격리 DB가 떠 있고 `.env.test`가 최신인지 확인한 뒤(Task 6 Step 4를 거쳤으면 최신이다):

```bash
npm run test:build
npx playwright test e2e/admin.trailer.spec.ts e2e/admin.video.spec.ts
```

Expected: 5개 테스트 PASS. 두 번째 테스트의 변환은 헤드리스에서 수십 초~수 분 걸린다. `변환 완료`가 안 뜨고 `alert`가 뜨면 그 문구(ffmpeg 오류 줄)를 읽는다 — 대개 CDN 접근 실패(네트워크) 또는 인자 문제다.

- [ ] **Step 4: 커밋**

```bash
git add e2e/video-fixture.ts e2e/admin.trailer.spec.ts
git commit -m "test(e2e): cover youtube and in-browser converted trailers on the book form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 문서 — PRD·운영 안내·FRONTEND·라이선스

**Files:**
- Modify: `docs/prd-ttokttok.md`
- Modify: `docs/video-operations.md`
- Modify: `docs/FRONTEND.md`
- Create: `docs/licenses/ffmpeg-wasm.txt`

- [ ] **Step 1: PRD §5.3 — 도서 트레일러 항목**

`docs/prd-ttokttok.md`의 §5.3 마지막 불릿("**전환 시 로드 관리**" 문단) 뒤, `### 5.4 전자책 뷰어` 앞에 추가:

```markdown
- **도서 트레일러** (2026-09-12): 게시물이 아니라 **도서**에 붙는 영상 하나. 소스는 게시물 영상과 같이 유튜브 또는 변환 묶음이고, 관리자 도서 폼의 「트레일러」 섹션에서 등록·교체·제거한다(「없음」 저장 = 제거). 묶음은 게시물·트레일러 중 한 곳에만 붙는다(`save_video_post`·`save_book_trailer`·`claim_video_cleanup`이 서로의 참조를 본다). **사용자 화면 노출은 후속 단계**다 — 도서 상세 시트 상단에 포스터 + 재생 글리프로 붙일 예정이며, 그때 `book_trailers`를 `BOOK_SELECT`에 임베드한다. 결정 기록 §11-70.
- **관리자 화면에서 mp4 직접 변환** (2026-09-12): 영상 칸이 mp4·mov를 받으면 브라우저 안의 FFmpeg(wasm)가 PC 도구와 파일 단위로 같은 묶음을 만들어 기존 업로드·검증 흐름에 넘긴다. 서버 변환은 두지 않는다. 상한(길이·용량)과 HDR 거부는 [운영 안내](./video-operations.md).
```

- [ ] **Step 2: PRD §6 — `book_trailers`**

`post_videos` 블록(`  asset_group_id uuid NULL FK video_uploads(id)` 줄) 바로 뒤, `video_uploads` 블록 앞에 추가:

```
book_trailers
  book_id uuid PK/FK books(id) on delete cascade,
  source_type text CHECK (source_type IN ('upload','youtube')),
  video_path text, youtube_id text, duration_sec int,
  hls_path text NULL, poster_path text NULL, renditions jsonb NULL,
  asset_group_id uuid NULL FK video_uploads(id)  -- post_videos와 같은 모양. 도서당 하나. 읽기 공개·쓰기 관리자(RPC save_book_trailer)
```

- [ ] **Step 3: PRD §11 — 결정 70**

§11 표의 마지막 행(69) 뒤에 추가(한 행, 파이프 구분):

```markdown
| 70 | 도서 트레일러와 브라우저 변환 | **도서당 트레일러 하나를 `book_trailers`(post_videos와 같은 모양)로 두고, mp4는 관리자 브라우저 안에서 변환한다**(2026-09-12). 조사: 밀리의서재 도서 상세 API(`apis.millie.co.kr/v3/content/detail/book/<id>/`)는 `book_trailer[]`를 **재사용 엔티티**로 둔다 — 유튜브 본편(`main_video_url`) + 자체 CDN 짧은 mp4 티저(`sub_video_mov_url`) + 썸네일, 도서별 순서·대표 플래그(`btr_order`·`main_video_yn`). 23권 중 3권에 있었고 내용은 밀리 채널 기획 영상이었다. 우리는 **재사용 엔티티를 두지 않는다**(사용자 결정) — 우리 `youtube`·`upload` 두 소스가 밀리의 2단 구조를 각각 맡고, 썸네일은 유튜브 `hqdefault`와 묶음 `poster.jpg`로 그때 만든다. 변환은 서버가 아니라 **브라우저 FFmpeg(wasm, 단일 스레드)** 다 — 09-11의 "변환 서버 없음" 결정을 유지하면서 관리자가 ZIP 도구를 따로 돌리지 않게 한다. 산출물은 PC 도구와 파일 단위로 같아야 하므로 사다리·인코딩 인자·마스터 재생 목록을 `packages/shared`로 뽑아 두 경로가 같은 함수를 쓴다. 단일 스레드 속도는 스파이크로 재서 상한을 정했다(설계 §4.4 실측). 멀티스레드 코어는 COOP/COEP가 관리자 앱의 외부 이미지를 깨뜨릴 수 있어 1차에서 제외. 사용자 노출은 후속. 설계: `docs/superpowers/specs/2026-09-12-book-trailer-design.md` |
```

- [ ] **Step 4: 운영 안내**

`docs/video-operations.md`의 「관리자가 하는 일」 절 끝(권장 길이 문단 뒤)에 새 절을 추가한다:

```markdown
## 관리자 화면에서 mp4 직접 변환

2026-09-12부터 영상 칸(「영상 파일 또는 변환한 ZIP」)이 mp4·mov를 받는다. 파일을 고르면 크기·길이가 보이고 **「변환」**을 누르면 브라우저 안의 FFmpeg(wasm, 단일 스레드)가 PC 도구와 파일 단위로 같은 묶음(화질별 HLS·`fallback.mp4`·`poster.jpg`·`manifest.json`)을 메모리에 만든다. 그 뒤 「영상 업로드」부터는 ZIP을 올렸을 때와 같다. 변환 도구(약 31MB)는 처음 한 번 내려받고, 서버로는 아무것도 보내지 않는다.

- 상한: 길이 [스파이크 확정값]초, 파일 300MB. 넘으면 PC 변환 도구의 ZIP을 올리라고 안내한다(PC 도구는 10분·512MiB).
- HDR 원본은 브라우저에서 거부한다 — 톤매핑 필터가 없다. PC 도구를 쓴다.
- 「변환 중단」은 변환만 멈춘다. 파일을 바꾸면 처음부터다.
- 게시물 영상과 도서 트레일러(도서 폼의 「트레일러」 섹션)가 같은 칸을 쓴다.
- 변환은 관리자 기기의 CPU를 쓴다. 60초 세로 1080p 기준 실측은 설계 문서 §4.4에 있다.
```

「저장과 실패 처리」 절의 "게시물 삭제/영상 교체 후 묶음은 명시적인 정리까지 남는다." 문장 뒤에 추가:

```markdown
도서 트레일러(`book_trailers`)도 같은 묶음 표를 쓴다. 한 묶음은 게시물·트레일러 중 **한 곳에만** 붙고(`save_video_post`·`save_book_trailer`가 서로의 참조를 거부), `claim_video_cleanup`은 트레일러 참조도 사용 중으로 본다. `/admin/videos`가 「트레일러에서 사용 중」과 도서 링크를 보인다.
```

「검증」 절 목록에 두 줄 추가:

```markdown
- `node --conditions=react-server --import tsx --test tests/live-db/book-trailers.test.ts`: 트레일러 RPC 권한·미검증 묶음 거부·게시물/트레일러 묶음 독점·정리 잠금·cascade.
- `npx playwright test e2e/admin.trailer.spec.ts`: 유튜브 트레일러 저장/제거, 브라우저 mp4 변환→업로드→트레일러 저장, 업로드 미완료 제출 가드.
```

- [ ] **Step 5: FRONTEND.md §6 한 줄**

§6의 첫 불릿("- 새 업로드 영상은 HLS 자동 화질을 사용한다. …") 끝에 문장을 덧붙인다:

```markdown
 mp4 직접 변환은 관리자 영상 칸(`video-bundle-field.tsx`)이 「변환」을 누를 때만 `@ffmpeg/ffmpeg`와 CDN 코어를 지연 로드한다 — 다른 화면·클라이언트 앱은 이 라이브러리를 모른다.
```

- [ ] **Step 6: 라이선스 고지**

`docs/licenses/ffmpeg-wasm.txt`:

```
ffmpeg.wasm — in-browser video conversion for the admin app

Wrapper: @ffmpeg/ffmpeg 0.12.15, @ffmpeg/util 0.12.2 — MIT (installed in apps/admin).
Core:    @ffmpeg/core 0.12.10 — GPL-2.0-or-later (FFmpeg built with libx264).
         Not bundled in this repository. Loaded at runtime in the administrator's
         browser from https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/
         (apps/admin/src/lib/video-convert.ts). Version is pinned.
Source:  https://github.com/ffmpegwasm/ffmpeg.wasm · https://ffmpeg.org · https://www.videolan.org/developers/x264.html

The core runs only inside the admin browser to produce HLS bundles that the
admin then uploads. No FFmpeg code is linked into or shipped with our
application bundles. Users of the client app never load it.
```

- [ ] **Step 7: 커밋**

```bash
git add docs/prd-ttokttok.md docs/video-operations.md docs/FRONTEND.md docs/licenses/ffmpeg-wasm.txt
git commit -m "docs: record book trailers, in-browser conversion and the ffmpeg.wasm licence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 최종 검증

**Files:** 없음(검증만). 실패하면 해당 Task로 돌아가 고치고 다시 돈다.

- [ ] **Step 1: 빌드·단위·타입**

```bash
npm run build
npm test
npm run lint
```

Expected: build 두 앱 `Compiled successfully`, vitest 전부 PASS. lint는 master에 이미 있던 6 error(`react-hooks/set-state-in-effect` 등, 이 작업이 건드리지 않은 파일)만 남고 **새 파일에서 오류가 없어야 한다** — `npx eslint apps/admin/src/components/admin/book-trailer-field.tsx apps/admin/src/components/admin/video-bundle-field.tsx apps/admin/src/lib/video-convert.ts packages/shared/src/video-ladder.ts packages/shared/src/video-encode.ts`가 0 error.

- [ ] **Step 2: 격리 DB·E2E**

```bash
node --conditions=react-server --import tsx --test tests/live-db/book-trailers.test.ts tests/live-db/video-bundles.test.ts
npm run test:build
npx playwright test e2e/admin.trailer.spec.ts e2e/admin.video.spec.ts e2e/admin.visual.spec.ts
```

Expected: 전부 PASS. `admin.visual`은 도서 폼 기준선이 있다면 「트레일러」 섹션 추가로 **깨질 수 있다** — 그 경우 기준선을 덮어쓰지 말고 차이 이미지를 확인한 뒤 사용자에게 보고한다(`docs/monorepo-testing.md`: 실패를 없애려고 기준을 덮어쓰지 않는다).

- [ ] **Step 3: 375px 실제 확인과 보고**

관리자 테스트 서버에서 `/admin/books/new`·`/admin/books/<트레일러 있는 도서>`·`/admin/videos`를 375px로 열어 스크린샷을 `.tmp/`에 남기고, 사용자에게 다음을 보고한다: 스파이크 수치와 확정 상한, 테스트 결과 요약, 운영 적용 순서(DB 마이그레이션 `20260912000003` → 관리자 앱 배포. 사용자 앱은 변경 없음).

- [ ] **Step 4: 브랜치 마무리**

`superpowers:finishing-a-development-branch` 스킬로 넘어간다. 머지 전 확인: `git log --oneline master..HEAD`에 위 커밋들이 있고, `git status`가 깨끗하다.

---

## 자체 점검 기록

- 스펙 §1·§2(조사) → Task 10 결정 70에 요약. §3(하지 않는 것) → 코드에 재사용 엔티티·서버 변환·클라이언트 노출 없음. §4.1~4.5 → Task 1·2·3·4·5·10. §5 → Task 6. §6.1~6.3 → Task 7·8. §7 → 변경 없음(Task 10 PRD 문구에 후속 명시). §8 → Task 1·3(단위), 6(격리 DB), 9(E2E), 5 Step 2(기존 갱신). §9 → Task 10. §10 → Task 11.
- 이름 일치: `validateBundleFiles`(Task 4 정의, Task 4 변환 모듈 사용) · `convertVideoFile`/`probeVideoFile`/`ConvertProgress`/`ConvertError`(Task 4 정의, Task 5 사용) · `buildVideoLadder`/`toManifestRendition`/`buildMasterPlaylist`(Task 1 정의, Task 3·4 사용) · `hlsEncodeArgs`/`fallbackArgs`/`posterArgs`/`parseStreamInfo`/`BROWSER_LIMITS`(Task 3 정의, Task 4·5 사용) · `BookTrailerValues`/`BookTrailerField`(Task 7 정의, Task 7 페이지 사용) · `save_book_trailer(p_book_id, p_source, p_youtube_id, p_upload_id)`(Task 6 정의, Task 7·9 사용) · `mp4Fixture`(Task 9).
- 스파이크 의존 값: `BROWSER_LIMITS`(Task 3)와 안내 문구(Task 5·10)는 Task 2 확정값을 넣는다 — 세 곳이 같은 상수를 읽도록 Task 5는 `BROWSER_LIMITS.maxDurationSec`을 import한다.
