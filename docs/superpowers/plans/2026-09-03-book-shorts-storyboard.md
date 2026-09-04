# 도서 소개 15초 쇼츠 스토리보드 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 책 정보를 넣으면 근거 붙은 컨셉 3안 → `storyboard.json` 하나 → 스크립트가 H3 프롬프트·콘티 시트·ASS 자막·번인 스크립트를 결정론적으로 파생하는 Claude Code 스킬을 `ttokttok/.claude/skills/book-shorts-storyboard/`에 만든다.

**Architecture:** 모델은 `storyboard.json`만 쓴다. `scripts/build-storyboard.mjs`가 검증(V1~V9) 후 모든 산출물을 생성한다. 순수 함수는 `scripts/lib/*.mjs`로 분리해 `node --test`로 단위 테스트한다. 콘티 패널은 `codex exec` 1회로 생성(내장 `image_gen`), 시트는 HTML 조판 후 Edge headless로 PNG 캡처.

**Tech Stack:** Node 24 (내장 test runner, 외부 의존성 0) · PowerShell 5.1 (`burn.ps1`) · ffmpeg (winget) · Codex CLI 0.128.0 · MS Edge headless

**Spec:** `docs/superpowers/specs/2026-09-03-book-shorts-storyboard-design.md`

## Global Constraints

- 모든 경로는 레포 루트 `ttokttok/` 기준. 스킬 루트 = `.claude/skills/book-shorts-storyboard/`
- 외부 npm 의존성 추가 금지. Node 내장 모듈만
- 테스트 실행: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
- `.ps1`·`.ass`는 **UTF-8 BOM**으로 쓴다 (PowerShell 5.1이 BOM 없는 한글을 깨뜨림)
- 검증 상수: 음절 ≤75 · 줄 ≤12자 · 큐 ≤2줄 · 큐 ≥0.8s · 프롬프트 ≤7,000자 · 샷 2~3 · 패널 4~6 · duration 4~15 정수
- ASS 스타일: `Malgun Gothic` 72/96px, PlayRes 1440×2560, MarginL/R 288, MarginV 384, Sub=Alignment 2, Title=Alignment 5
- codex 인자는 `scripts/lib/codex-panels.mjs`의 `CODEX_ARGS` 한 곳에만: `exec -c service_tier=fast -c model=gpt-5.5 --skip-git-repo-check`
- 커밋 메시지: `type(scope): 한국어 설명` + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 브랜치: 현재 `feat/comment-threads`에 그대로 커밋 (사용자 결정)

## 파일 구조

```
.claude/skills/book-shorts-storyboard/
├── SKILL.md                          # Task 11
├── references/
│   ├── evidence.json                 # Task 1  — 증거 ID 레지스트리 (스크립트가 읽음)
│   ├── h3-prompt-spec.md             # Task 10
│   ├── hook-playbook.md              # Task 10
│   ├── conti-panel-spec.md           # Task 10
│   └── ttokttok-delivery.md          # Task 10
├── templates/
│   └── contisheet.html               # Task 7
└── scripts/
    ├── build-storyboard.mjs          # Task 9  — CLI 진입점
    ├── build.test.mjs                # Task 9  — e2e
    ├── fixtures/
    │   └── kafka-metamorphosis.json  # Task 3
    └── lib/
        ├── text.mjs          (+test) # Task 1  — countSyllables, hasLatinOrDigit, wrapCue
        ├── timecode.mjs      (+test) # Task 2  — toH3Timecode, toAssTimecode
        ├── camera.mjs        (+test) # Task 2  — CAMERA_TYPES, AMPLITUDES, SPEEDS, cameraPhrase
        ├── validate.mjs      (+test) # Task 3  — validateStoryboard, LIMITS
        ├── render-h3.mjs     (+test) # Task 4  — renderH3Prompt, cuesForShot
        ├── render-ass.mjs    (+test) # Task 5  — renderAss
        ├── render-burn.mjs           # Task 5  — renderBurnPs1
        ├── render-panels.mjs (+test) # Task 6  — renderPanelPrompts, renderPanelPromptsText
        ├── codex-panels.mjs  (+test) # Task 6  — CODEX_ARGS, buildPanelInstruction, generatePanels
        ├── render-sheet.mjs  (+test) # Task 7  — renderContiSheet
        ├── sheet-png.mjs             # Task 7  — findBrowser, sheetHeight, captureSheetPng
        └── render-md.mjs     (+test) # Task 8  — renderStoryboardMd
docs/shorts/kafka-metamorphosis/      # Task 12 — 실측 예제 산출물
.gitignore                            # Task 9  — 대용량 산출물 제외
```

테스트 파일은 각 모듈 옆 `scripts/lib/<name>.test.mjs`.

---

### Task 1: 스캐폴드 · evidence.json · text.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/references/evidence.json`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/text.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/text.test.mjs`

**Interfaces:**
- Produces: `countSyllables(text: string): number` — 한글 완성형(U+AC00–D7A3)만 센다
- Produces: `hasLatinOrDigit(text: string): boolean`
- Produces: `wrapCue(text: string, maxLen = 12): string[]` — 공백 우선 줄바꿈, 긴 단어는 강제 분할
- Produces: `evidence.json` — `{ [id]: { grade: 'A'|'B'|'C', claim_ko, source, url } }`

- [ ] **Step 1: 디렉터리 생성과 evidence.json 작성**

```bash
mkdir -p .claude/skills/book-shorts-storyboard/{references,templates,scripts/lib,scripts/fixtures}
```

`.claude/skills/book-shorts-storyboard/references/evidence.json`:

```json
{
  "A-1": {
    "grade": "A",
    "claim_ko": "고각성 감정(경외·분노·불안)이 저각성(슬픔)보다 확산 우위. NYT 3개월 전수 데이터 + 인과 실험으로 검증",
    "source": "Berger & Milkman 2012, Journal of Marketing Research 49(2)",
    "url": "https://journals.sagepub.com/doi/10.1509/jmr.10.0353"
  },
  "A-2": {
    "grade": "A",
    "claim_ko": "호기심은 정보격차에서 발생. 최대 조건 3: 빠진 걸 알아챌 만큼 알아야 / 빠진 정보가 구체적이어야 / 메울 수 있다고 느껴야",
    "source": "Loewenstein 1994, Psychological Bulletin 116(1), 75–98",
    "url": "https://doi.org/10.1037/0033-2909.116.1.75"
  },
  "A-3": {
    "grade": "A",
    "claim_ko": "서사 몰입(transportation)이 반론을 억제하고 태도를 바꿈 (실험 N=97, N=69)",
    "source": "Green & Brock 2000, Journal of Personality and Social Psychology 79(5), 701–721",
    "url": "https://pubmed.ncbi.nlm.nih.gov/11079236/"
  },
  "A-4": {
    "grade": "A",
    "claim_ko": "미완결 과제가 완결 과제보다 기억에 남는다 — 클리프행어·미해결 질문의 근거",
    "source": "Zeigarnik 1927, Psychologische Forschung 9",
    "url": "https://en.wikipedia.org/wiki/Zeigarnik_effect"
  },
  "B-1": {
    "grade": "B",
    "claim_ko": "시청자 71%가 첫 3초 안에 계속 볼지 결정한다",
    "source": "TTS Vibes 2025 (업계 리포트 재인용, 1차 출처 미확인)",
    "url": "https://insights.ttsvibes.com/tiktok-first-3-seconds-hook-retention-rate/"
  },
  "B-2": {
    "grade": "B",
    "claim_ko": "3초 유지율 85%↑ → 총 조회수 2.8배, 70~85% → 2.2배. 알고리즘 추천 최소 임계 65~70%",
    "source": "TTS Vibes 2025 (업계 리포트 재인용, 1차 출처 미확인)",
    "url": "https://insights.ttsvibes.com/tiktok-first-3-seconds-hook-retention-rate/"
  },
  "B-3": {
    "grade": "B",
    "claim_ko": "애니메이션 완주율 70~85% vs 실사 50~65%; 3D 애니메이션 몰입 +30% (Millward Brown)",
    "source": "Educational Voice · Kablak Studios (Millward Brown 재인용)",
    "url": "https://educationalvoice.co.uk/effective-animated-video-statistics/"
  },
  "C-1": {
    "grade": "C",
    "claim_ko": "북톡에서 트로프를 명시한 훅이 일반 설명 대비 인게이지먼트 3배",
    "source": "Yaaka (업계 주장, 수치 검증 불가)",
    "url": "https://www.yaaka.cc/the-anatomy-of-a-viral-booktok-video-deconstructing-the-formula/"
  },
  "C-2": {
    "grade": "C",
    "claim_ko": "쇼츠 최적 길이 20~30초, 15초 미만은 훅 깊이 부족",
    "source": "Toptal Creator (업계 주장)",
    "url": "https://www.toptal.com/creator/post/youtube-shorts-length"
  }
}
```

- [ ] **Step 2: text.test.mjs 작성 (실패하는 테스트)**

`.claude/skills/book-shorts-storyboard/scripts/lib/text.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables, hasLatinOrDigit, wrapCue } from './text.mjs';

test('countSyllables: 한글 완성형만 센다', () => {
  assert.equal(countSyllables('아침에 눈을 떴는데'), 8);
  assert.equal(countSyllables('1984년, Big Brother!'), 1);
  assert.equal(countSyllables(''), 0);
  assert.equal(countSyllables('ㄱㄴㄷ'), 0); // 자모는 음절이 아니다
});

test('hasLatinOrDigit', () => {
  assert.equal(hasLatinOrDigit('아침에 눈을 떴는데'), false);
  assert.equal(hasLatinOrDigit('1984년'), true);
  assert.equal(hasLatinOrDigit('Big Brother'), true);
});

test('wrapCue: 12자 이내면 한 줄', () => {
  assert.deepEqual(wrapCue('아침에 눈을 떴는데'), ['아침에 눈을 떴는데']);
});

test('wrapCue: 공백에서 줄을 바꾼다', () => {
  assert.deepEqual(wrapCue('몸이 벌레로 변해 있었다'), ['몸이 벌레로 변해', '있었다']);
  assert.deepEqual(wrapCue('세상은 아무 일 없다는 듯 출근을 재촉했다'), ['세상은 아무 일 없다는', '듯 출근을 재촉했다']);
});

test('wrapCue: 공백 없는 긴 단어는 강제 분할', () => {
  assert.deepEqual(wrapCue('가나다라마바사아자차카타파하'), ['가나다라마바사아자차카타', '파하']);
});

test('wrapCue: maxLen 인자', () => {
  assert.deepEqual(wrapCue('가나 다라 마바', 5), ['가나 다라', '마바']);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — `Cannot find module '.../text.mjs'`

- [ ] **Step 4: text.mjs 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/text.mjs`:

```js
/**
 * 한국어 대본·자막 텍스트 유틸.
 * 음절 = 한글 완성형 글자 하나. 숫자·영문·문장부호·자모는 세지 않는다 —
 * 대본은 숫자를 한글로 풀어 쓰는 것이 규칙이다 (SKILL.md).
 */
const HANGUL_SYLLABLE = /[가-힣]/g;

export function countSyllables(text) {
  return (String(text ?? '').match(HANGUL_SYLLABLE) ?? []).length;
}

export function hasLatinOrDigit(text) {
  return /[0-9A-Za-z]/.test(String(text ?? ''));
}

/**
 * 자막 한 큐를 줄로 나눈다. maxLen 안에서 마지막 공백을 우선하고,
 * 공백이 없는 긴 단어는 maxLen 단위로 강제 분할한다.
 * 글자수는 공백 포함 — 폭 기준으로 보수적이다.
 */
export function wrapCue(text, maxLen = 12) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (w.length > maxLen) {
      if (cur) { lines.push(cur); cur = ''; }
      let i = 0;
      for (; i + maxLen < w.length; i += maxLen) lines.push(w.slice(i, i + maxLen));
      cur = w.slice(i);
      continue;
    }
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxLen) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# pass 6` `# fail 0`

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard
git commit -m "feat(skill): 쇼츠 스토리보드 스킬 스캐폴드 — 증거 레지스트리와 텍스트 유틸

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: timecode.mjs · camera.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/timecode.mjs`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/camera.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/timecode.test.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/camera.test.mjs`

**Interfaces:**
- Produces: `toH3Timecode(sec: number): string` → `MM:SS.mmm`
- Produces: `toAssTimecode(sec: number): string` → `H:MM:SS.cc`
- Produces: `CAMERA_TYPES: Record<string,string>` (18개 type → 동사구), `AMPLITUDES = ['small','medium','large']`, `SPEEDS = ['slow','medium','fast']`
- Produces: `cameraPhrase(cam: {type, amplitude?, speed?, target?}): string`

- [ ] **Step 1: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/timecode.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toH3Timecode, toAssTimecode } from './timecode.mjs';

test('toH3Timecode: MM:SS.mmm', () => {
  assert.equal(toH3Timecode(0), '00:00.000');
  assert.equal(toH3Timecode(3.5), '00:03.500');
  assert.equal(toH3Timecode(10.5), '00:10.500');
  assert.equal(toH3Timecode(75.25), '01:15.250');
});

test('toAssTimecode: H:MM:SS.cc', () => {
  assert.equal(toAssTimecode(0.4), '0:00:00.40');
  assert.equal(toAssTimecode(15), '0:00:15.00');
  assert.equal(toAssTimecode(75.25), '0:01:15.25');
  assert.equal(toAssTimecode(3661.5), '1:01:01.50');
});
```

`.claude/skills/book-shorts-storyboard/scripts/lib/camera.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TYPES, AMPLITUDES, SPEEDS, cameraPhrase } from './camera.mjs';

test('static은 amplitude/speed 없이', () => {
  assert.equal(cameraPhrase({ type: 'static' }), 'The camera holds completely static');
});

test('type + amplitude + speed + target', () => {
  assert.equal(
    cameraPhrase({ type: 'push', amplitude: 'small', speed: 'slow', target: 'his face' }),
    'The camera pushes in with small amplitude at slow speed toward his face',
  );
  assert.equal(
    cameraPhrase({ type: 'truck_right', amplitude: 'medium', speed: 'slow' }),
    'The camera trucks right with medium amplitude at slow speed',
  );
});

test('18개 type 전부 문장을 만든다', () => {
  const types = Object.keys(CAMERA_TYPES);
  assert.equal(types.length, 18);
  for (const type of types) {
    const s = cameraPhrase({ type, amplitude: 'small', speed: 'slow' });
    assert.ok(s.startsWith('The camera '), type);
  }
});

test('허용값 목록', () => {
  assert.deepEqual(AMPLITUDES, ['small', 'medium', 'large']);
  assert.deepEqual(SPEEDS, ['slow', 'medium', 'fast']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — 모듈 없음 (timecode, camera)

- [ ] **Step 3: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/timecode.mjs`:

```js
const pad2 = (n) => String(n).padStart(2, '0');

/** MiniMax H3 타임코드: `At 00:03.500, the camera cuts to …` */
export function toH3Timecode(sec) {
  const ms = Math.round(sec * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${pad2(m)}:${pad2(s)}.${mmm}`;
}

/** ASS 타임코드: `0:00:03.50` (센티초) */
export function toAssTimecode(sec) {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(c)}`;
}
```

`.claude/skills/book-shorts-storyboard/scripts/lib/camera.mjs`:

```js
/**
 * H3 카메라 문법: type + amplitude + speed를 자연어로, 샷당 1개.
 * 정본: references/h3-prompt-spec.md
 */
export const CAMERA_TYPES = {
  static: 'holds completely static',
  push: 'pushes in',
  pull: 'pulls back',
  zoom_in: 'zooms in',
  zoom_out: 'zooms out',
  pan_left: 'pans left',
  pan_right: 'pans right',
  truck_left: 'trucks left',
  truck_right: 'trucks right',
  tilt_up: 'tilts up',
  tilt_down: 'tilts down',
  pedestal_up: 'pedestals up',
  pedestal_down: 'pedestals down',
  arc: 'arcs around the subject',
  tracking: 'tracks alongside the subject',
  shake: 'shakes handheld',
  pov: 'moves as a first-person point of view',
  roll: 'rolls',
};

export const AMPLITUDES = ['small', 'medium', 'large'];
export const SPEEDS = ['slow', 'medium', 'fast'];

export function cameraPhrase(cam) {
  const verb = CAMERA_TYPES[cam.type];
  if (!verb) throw new Error(`알 수 없는 camera.type: ${cam.type}`);
  if (cam.type === 'static') return `The camera ${verb}`;
  let s = `The camera ${verb} with ${cam.amplitude} amplitude at ${cam.speed} speed`;
  if (cam.target) s += ` toward ${cam.target}`;
  return s;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# pass 12` `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): H3·ASS 타임코드와 카메라 문구 생성기

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 픽스처 · validate.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/fixtures/kafka-metamorphosis.json`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/validate.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/validate.test.mjs`

**Interfaces:**
- Consumes: `countSyllables`, `hasLatinOrDigit`, `wrapCue` (text.mjs); `CAMERA_TYPES`, `AMPLITUDES`, `SPEEDS` (camera.mjs)
- Produces: `LIMITS` 상수
- Produces: `validateStoryboard(sb, evidence, { renderPrompt? }) → { ok, errors: {rule, message}[], warnings: {rule, message}[], metrics: { syllables, cues, shots, panels, promptChars } }`. `renderPrompt(sb) → string`을 넘기면 V4(프롬프트 길이)를 검사한다 — render-h3.mjs는 Task 4에서 만들므로 여기서는 옵션 주입으로 순환 의존을 피한다
- Produces: 픽스처 — 검증을 **경고 없이** 통과하는 완전한 예제. 이후 모든 렌더 테스트가 이 픽스처를 쓴다

- [ ] **Step 1: 픽스처 작성**

`.claude/skills/book-shorts-storyboard/scripts/fixtures/kafka-metamorphosis.json`:

```json
{
  "version": 1,
  "book": { "title": "변신", "author": "프란츠 카프카", "slug": "kafka-metamorphosis" },
  "duration_sec": 15,
  "concepts": [
    {
      "id": "A",
      "hook_type": "curiosity-gap",
      "tone": "unsettling",
      "visual_style": "ink-line-art",
      "hook_line_ko": "아침에 눈을 떴는데, 몸이 내 것이 아니었다.",
      "evidence": ["A-2", "B-1"],
      "primary_evidence": "A-2",
      "why_this_book_ko": "원작 첫 문장이 이미 구체적인 정보격차다 — 무엇으로 변했는지 3초간 보여주지 않으면 갭이 열린다. 각색 손실 없음."
    },
    {
      "id": "B",
      "hook_type": "pattern-interrupt",
      "tone": "deadpan-humor",
      "visual_style": "flat-cartoon",
      "hook_line_ko": "출근 안 하면 큰일 나는 남자. 오늘은 벌레라서 못 갔다.",
      "evidence": ["A-1", "B-3"],
      "primary_evidence": "A-1",
      "why_this_book_ko": "비극을 무표정 유머로 뒤집으면 고각성(놀람)이 생긴다. 애니메이션 완주율 우위(B-3)와 결합."
    },
    {
      "id": "C",
      "hook_type": "bold-claim",
      "tone": "awe",
      "visual_style": "cinematic-realism",
      "hook_line_ko": "백 년 넘게 읽히는 이유가 첫 문장 하나에 있다.",
      "evidence": ["A-3", "C-1"],
      "primary_evidence": "A-3",
      "why_this_book_ko": "첫 문장을 실사 장면으로 재현해 서사 몰입(A-3)을 직접 일으킨다. 근거 하나가 C등급이라 표시한다."
    }
  ],
  "selected_concept": "A",
  "style_lock": "monochrome ink line art, thin clean strokes, flat white background, minimal hatching for shadow, no color",
  "character_sheet": "a gaunt man in his early thirties, short dark hair, hollow cheeks, thin frame, wearing a rumpled grey shirt",
  "shots": [
    {
      "n": 1,
      "start": 0,
      "end": 3,
      "description": "a gaunt man lying in a narrow bed in a dim room, staring at the ceiling, one thin arm raised stiffly above him",
      "camera": { "type": "push", "amplitude": "small", "speed": "slow", "target": "his wide-open eyes" },
      "sfx": "the muffled ticking of an alarm clock"
    },
    {
      "n": 2,
      "start": 3,
      "end": 10.5,
      "description": "a low angle from the floorboards: his silhouette now hunched and insect-like against the closed bedroom door, a plate of bread pushed under the door by an unseen hand",
      "camera": { "type": "tilt_up", "amplitude": "small", "speed": "slow" },
      "sfx": "a key turning in a lock, then footsteps receding down a hallway"
    },
    {
      "n": 3,
      "start": 10.5,
      "end": 15,
      "description": "a wide view of a grey city street at morning rush hour, commuters streaming past a shuttered apartment window on the second floor",
      "camera": { "type": "truck_right", "amplitude": "medium", "speed": "slow" },
      "sfx": "crowd murmur and a distant tram bell"
    }
  ],
  "narration": [
    { "start": 0.4, "end": 2.8, "text_ko": "아침에 눈을 떴는데" },
    { "start": 3.2, "end": 5.8, "text_ko": "몸이 벌레로 변해 있었다" },
    { "start": 6.2, "end": 8.6, "text_ko": "가족은 그를 방에 가뒀고" },
    { "start": 9.0, "end": 11.2, "text_ko": "세상은 아무 일 없다는 듯" },
    { "start": 11.5, "end": 13.0, "text_ko": "출근을 재촉했다" },
    { "start": 13.4, "end": 14.8, "text_ko": "카프카, 변신" }
  ],
  "overall_soundscape": "A quiet apartment interior with a faint clock tick and wooden floor creaks, giving way to a muffled city outside — traffic hum, a tram bell, indistinct crowd murmur. No music inside the scene.",
  "non_diegetic_music": "A single sustained cello note with slow, sparse pizzicato underneath, around 60 BPM, barely audible at first and swelling slightly in the final four seconds.",
  "panels": [
    {
      "id": "01",
      "shot": 1,
      "shot_type": "medium close-up",
      "action": "a gaunt man lying in bed staring at the ceiling, one thin arm raised stiffly",
      "video_note_ko": "어두운 방, 침대에 누운 그레고르. 천장을 본다. 한쪽 팔이 뻣뻣하게 들려 있다",
      "audio_note_ko": "NA) 아침에 눈을 떴는데 / S.E) 알람 시계 초침 소리"
    },
    {
      "id": "02",
      "shot": 1,
      "shot_type": "extreme close-up",
      "action": "the man's wide-open eye, a segmented insect leg reflected in the pupil",
      "video_note_ko": "크게 뜬 눈. 눈동자에 마디 진 벌레 다리가 비친다",
      "audio_note_ko": "S.E) 초침 소리가 멈춘다"
    },
    {
      "id": "03",
      "shot": 2,
      "shot_type": "low angle wide shot",
      "action": "a hunched insect-like silhouette pressed against a closed bedroom door, seen from the floorboards",
      "video_note_ko": "바닥에서 올려다본 앵글. 닫힌 문에 붙은 벌레 같은 실루엣",
      "audio_note_ko": "NA) 몸이 벌레로 변해 있었다 / S.E) 열쇠 돌리는 소리"
    },
    {
      "id": "04",
      "shot": 2,
      "shot_type": "close-up",
      "action": "a plate of bread being pushed under a door by an unseen hand",
      "video_note_ko": "문 아래로 밀려 들어오는 빵 접시. 손은 보이지 않는다",
      "audio_note_ko": "NA) 가족은 그를 방에 가뒀고 / S.E) 멀어지는 발소리"
    },
    {
      "id": "05",
      "shot": 3,
      "shot_type": "wide shot",
      "action": "a grey city street at rush hour, commuters streaming past a shuttered second-floor window",
      "video_note_ko": "출근길 도심. 인파가 흐르고, 2층 창문 하나만 닫혀 있다",
      "audio_note_ko": "NA) 세상은 아무 일 없다는 듯 출근을 재촉했다 / NA) 카프카, 변신 / S.E) 트램 종소리"
    }
  ],
  "title_card": { "text_ko": "변신 · 프란츠 카프카", "at": 12.5 }
}
```

내레이션 음절 합계 = 8+10+10+10+7+5 = **50** (≤75). 큐 최대 "몸이 벌레로 변해 있었다" 13자 → 2줄. 마지막 샷 [10.5, 15)에 `title_card.at` 12.5.

- [ ] **Step 2: validate.test.mjs 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/validate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStoryboard, LIMITS } from './validate.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const clone = () => structuredClone(fixture);
const rules = (r) => r.errors.map((e) => e.rule);

test('픽스처는 에러·경고 없이 통과한다', () => {
  const r = validateStoryboard(fixture, evidence);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ok, true);
  assert.equal(r.metrics.syllables, 50);
  assert.equal(r.metrics.shots, 3);
  assert.equal(r.metrics.panels, 5);
  assert.equal(r.metrics.cues, 6);
});

test('V1: 샷 수·연속성·duration', () => {
  let sb = clone(); sb.shots = [sb.shots[0]]; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[1].start = 3.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[2].end = 14; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.duration_sec = 15.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[0].start = 0.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
});

test('V2: 내레이션 75음절 초과는 에러, 숫자·영문은 경고', () => {
  let sb = clone(); sb.narration[0].text_ko = '가'.repeat(12); // 50-8+12 = 54 → 통과
  assert.equal(validateStoryboard(sb, evidence).errors.filter((e) => e.rule === 'V2').length, 0);
  sb = clone(); sb.narration[0] = { start: 0.4, end: 2.8, text_ko: '가 '.repeat(12).trim() };
  sb.narration[1].text_ko = '가나다 라마바 사아자 차'; // 총 = 12 + 10 + 10 + 10 + 7 + 5 = 54 → 아직 통과
  sb.narration[2].text_ko = '가나다 라마바 사아자 차카타 파'; // 12+10+13+10+7+5 = 57
  sb.narration[3].text_ko = '가나다 라마바 사아자 차카타 파하'; // 12+10+13+14+7+5 = 61
  sb.narration[4].text_ko = '가나다 라마바 사아자 차카타'; // +12 → 12+10+13+14+12+5 = 66
  sb.narration[5].text_ko = '가나다 라마바 사아자 차카'; // +11 → 72 → 통과
  assert.equal(validateStoryboard(sb, evidence).errors.filter((e) => e.rule === 'V2').length, 0);
  sb.narration[5].text_ko = '가나다 라마바 사아자 차카타 파하'; // 14 → 75 → 통과(경계)
  assert.equal(validateStoryboard(sb, evidence).errors.filter((e) => e.rule === 'V2').length, 0);
  sb.narration[4].text_ko = '가나다 라마바 사아자 차카타 파'; // 13 → 76 → 에러
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V2'));
  sb = clone(); sb.narration[0].text_ko = '1984년 이야기';
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V2w'));
});

test('V3: 큐 줄수·최소 표시·겹침·범위', () => {
  let sb = clone(); sb.narration[0].text_ko = '가나다 라마바 사아자 차카타 파하가 나다라'; // 3줄
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[0].end = sb.narration[0].start + 0.5;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[1].start = 2.0; // 0번 큐(0.4~2.8)와 겹침
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[5].end = 15.5;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
});

test('V3w: 7음절/초 초과는 경고', () => {
  const sb = clone(); sb.narration[0] = { start: 0.4, end: 1.4, text_ko: '아침에눈을떴는데말이지' }; // 11음절/1초
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V3w'));
});

test('V4: 렌더러가 주어지면 프롬프트 길이를 본다', () => {
  const r = validateStoryboard(fixture, evidence, { renderPrompt: () => 'x'.repeat(7001) });
  assert.ok(rules(r).includes('V4'));
  assert.equal(r.metrics.promptChars, 7001);
  const ok = validateStoryboard(fixture, evidence, { renderPrompt: () => 'short' });
  assert.equal(ok.metrics.promptChars, 5);
  assert.equal(validateStoryboard(fixture, evidence).metrics.promptChars, null);
});

test('V5: 컨셉 3개·근거 존재·주근거/훅 유형 중복·선택안', () => {
  let sb = clone(); sb.concepts.pop(); assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[0].evidence = []; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[0].evidence = ['Z-9']; sb.concepts[0].primary_evidence = 'Z-9';
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[1].primary_evidence = 'A-2'; sb.concepts[1].evidence = ['A-2', 'B-3'];
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[1].hook_type = 'curiosity-gap'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.selected_concept = 'Z'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
});

test('V5w: 선택 컨셉이 C등급뿐이면 경고', () => {
  const sb = clone(); sb.concepts[0].evidence = ['C-1']; sb.concepts[0].primary_evidence = 'C-1';
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V5w'));
});

test('V6: 카메라 type·amplitude·speed', () => {
  let sb = clone(); sb.shots[0].camera = { type: 'dolly_zoom', amplitude: 'small', speed: 'slow' };
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
  sb = clone(); sb.shots[0].camera = { type: 'push', speed: 'slow' };
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
  sb = clone(); sb.shots[0].camera = { type: 'static' };
  assert.equal(validateStoryboard(sb, evidence).errors.filter((e) => e.rule === 'V6').length, 0);
  sb = clone(); delete sb.shots[0].camera;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
});

test('V7: 패널 수·shot 참조·style_lock', () => {
  let sb = clone(); sb.panels = sb.panels.slice(0, 3); assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
  sb = clone(); sb.panels[0].shot = 9; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
  sb = clone(); sb.style_lock = '  '; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
});

test('V8: 제목 카드 위치·텍스트', () => {
  let sb = clone(); sb.title_card.at = 5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V8'));
  sb = clone(); sb.title_card.text_ko = ''; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V8'));
});

test('V9: 제목·슬러그', () => {
  let sb = clone(); sb.book.title = ''; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V9'));
  sb = clone(); sb.book.slug = 'Kafka Metamorphosis'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V9'));
});

test('LIMITS 상수', () => {
  assert.equal(LIMITS.maxSyllables, 75);
  assert.equal(LIMITS.maxLineLen, 12);
  assert.equal(LIMITS.maxPromptChars, 7000);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — `validate.mjs` 없음

- [ ] **Step 4: validate.mjs 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/validate.mjs`:

```js
import { countSyllables, hasLatinOrDigit, wrapCue } from './text.mjs';
import { CAMERA_TYPES, AMPLITUDES, SPEEDS } from './camera.mjs';

/**
 * 검증 상수. 근거는 설계 문서 "검증 규칙" 절.
 * maxSyllables: 한국어 발화 5.5음절/초 × 15초 = 82, 호흡 여유 7 차감.
 * maxLineLen: 자막 폭 864px ÷ 72px 폰트 = 12자.
 */
export const LIMITS = {
  maxSyllables: 75,
  maxLineLen: 12,
  maxLines: 2,
  minCueSec: 0.8,
  warnSyllablesPerSec: 7,
  maxPromptChars: 7000,
  shots: [2, 3],
  panels: [4, 6],
  duration: [4, 15],
};

/**
 * @param sb storyboard.json 객체
 * @param evidence references/evidence.json 객체
 * @param opts.renderPrompt (sb) => string — 주어지면 V4(프롬프트 길이)를 검사한다
 */
export function validateStoryboard(sb, evidence, { renderPrompt } = {}) {
  const errors = [];
  const warnings = [];
  const err = (rule, message) => errors.push({ rule, message });
  const warn = (rule, message) => warnings.push({ rule, message });
  const L = LIMITS;

  // V9 — 식별 정보
  if (!sb.book?.title?.trim()) err('V9', 'book.title이 비어 있음');
  if (!/^[a-z0-9-]+$/.test(sb.book?.slug ?? '')) err('V9', `book.slug는 소문자·숫자·하이픈만 (현재 '${sb.book?.slug}')`);

  // V1 — 샷 구조
  const d = sb.duration_sec;
  if (!Number.isInteger(d) || d < L.duration[0] || d > L.duration[1]) err('V1', `duration_sec는 ${L.duration[0]}~${L.duration[1]} 정수 (현재 ${d})`);
  const shots = Array.isArray(sb.shots) ? sb.shots : [];
  if (shots.length < L.shots[0] || shots.length > L.shots[1]) err('V1', `샷은 ${L.shots[0]}~${L.shots[1]}개 (현재 ${shots.length})`);
  if (shots.length) {
    if (shots[0].start !== 0) err('V1', `shots[0].start는 0 (현재 ${shots[0].start})`);
    shots.forEach((s, i) => {
      if (!(s.end > s.start)) err('V1', `Shot ${s.n}: end(${s.end})가 start(${s.start})보다 커야 함`);
      if (i > 0 && shots[i - 1].end !== s.start) err('V1', `Shot ${s.n}: 이전 샷 end(${shots[i - 1].end})와 start(${s.start})가 다름 — 샷은 빈틈 없이 이어져야 함`);
    });
    const last = shots[shots.length - 1];
    if (last.end !== d) err('V1', `마지막 샷 end(${last.end})가 duration_sec(${d})과 다름`);
  }

  // V6 — 카메라
  for (const s of shots) {
    const c = s.camera;
    if (!c || typeof c !== 'object') { err('V6', `Shot ${s.n}: camera 없음`); continue; }
    if (!(c.type in CAMERA_TYPES)) { err('V6', `Shot ${s.n}: camera.type '${c.type}'는 허용값이 아님 (${Object.keys(CAMERA_TYPES).join('|')})`); continue; }
    if (c.type === 'static') continue;
    if (!AMPLITUDES.includes(c.amplitude)) err('V6', `Shot ${s.n}: camera.amplitude는 ${AMPLITUDES.join('|')} (현재 '${c.amplitude}')`);
    if (!SPEEDS.includes(c.speed)) err('V6', `Shot ${s.n}: camera.speed는 ${SPEEDS.join('|')} (현재 '${c.speed}')`);
  }

  // V2 — 내레이션 총량
  const cues = Array.isArray(sb.narration) ? sb.narration : [];
  const allText = cues.map((c) => c.text_ko ?? '').join(' ');
  const syllables = countSyllables(allText);
  if (syllables > L.maxSyllables) err('V2', `내레이션 ${syllables}음절 — 상한 ${L.maxSyllables} (15초에 읽히지 않음). 문장을 줄이거나 빼라`);
  if (hasLatinOrDigit(allText)) warn('V2w', '대본에 숫자·영문이 있음 — 한글로 풀어 쓰면 TTS 낭독과 음절 계산이 안정됨');

  // V3 — 자막 큐
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  sorted.forEach((c, i) => {
    const text = c.text_ko ?? '';
    const lines = wrapCue(text, L.maxLineLen);
    if (lines.length > L.maxLines) err('V3', `큐 "${text}": ${lines.length}줄 — 최대 ${L.maxLines}줄(줄당 ${L.maxLineLen}자). 큐를 나눠라`);
    const dur = c.end - c.start;
    if (!(dur >= L.minCueSec)) err('V3', `큐 "${text}": 표시 ${Number(dur).toFixed(2)}s — 최소 ${L.minCueSec}s`);
    if (c.start < 0 || c.end > d) err('V3', `큐 "${text}": [0, ${d}] 밖 (${c.start}~${c.end})`);
    if (i > 0 && c.start < sorted[i - 1].end) err('V3', `큐 "${text}": 이전 큐(${sorted[i - 1].end}s 종료)와 겹침`);
    if (dur > 0) {
      const sps = countSyllables(text) / dur;
      if (sps > L.warnSyllablesPerSec) warn('V3w', `큐 "${text}": ${sps.toFixed(1)}음절/초 — 너무 빠름 (권장 ≤${L.warnSyllablesPerSec})`);
    }
  });

  // V5 — 컨셉과 근거
  const concepts = Array.isArray(sb.concepts) ? sb.concepts : [];
  if (concepts.length !== 3) err('V5', `컨셉은 정확히 3개 (현재 ${concepts.length}) — 기각안도 기록한다`);
  const primaries = new Set();
  const hooks = new Set();
  for (const c of concepts) {
    const ev = Array.isArray(c.evidence) ? c.evidence : [];
    if (!ev.length) err('V5', `컨셉 ${c.id}: 근거 ID가 없음 — 근거 없는 안은 제시 금지`);
    for (const id of ev) if (!evidence[id]) err('V5', `컨셉 ${c.id}: 근거 '${id}'가 evidence.json에 없음`);
    if (!ev.includes(c.primary_evidence)) err('V5', `컨셉 ${c.id}: primary_evidence '${c.primary_evidence}'가 evidence 목록에 없음`);
    if (primaries.has(c.primary_evidence)) err('V5', `컨셉 ${c.id}: 주근거 '${c.primary_evidence}' 중복 — 3안은 서로 다른 주근거에 기대야 함`);
    primaries.add(c.primary_evidence);
    if (hooks.has(c.hook_type)) err('V5', `컨셉 ${c.id}: 훅 유형 '${c.hook_type}' 중복 — 3안은 서로 다른 훅 유형`);
    hooks.add(c.hook_type);
  }
  const selected = concepts.find((c) => c.id === sb.selected_concept);
  if (!selected) err('V5', `selected_concept '${sb.selected_concept}'에 해당하는 컨셉이 없음`);
  else if ((selected.evidence ?? []).length && selected.evidence.every((id) => evidence[id]?.grade === 'C')) warn('V5w', '선택 컨셉의 근거가 C등급(업계 주장)뿐 — 사용자에게 [C] 표시했는지 확인');

  // V7 — 패널
  const panels = Array.isArray(sb.panels) ? sb.panels : [];
  if (panels.length < L.panels[0] || panels.length > L.panels[1]) err('V7', `패널은 ${L.panels[0]}~${L.panels[1]}개 (현재 ${panels.length})`);
  for (const p of panels) if (!shots.some((s) => s.n === p.shot)) err('V7', `패널 ${p.id}: shot ${p.shot}이 없음`);
  if (!sb.style_lock?.trim()) err('V7', 'style_lock이 비어 있음 — 패널 룩이 갈린다');

  // V8 — 제목 카드
  const last = shots[shots.length - 1];
  if (!sb.title_card?.text_ko?.trim()) err('V8', 'title_card.text_ko가 비어 있음');
  if (last) {
    const at = sb.title_card?.at;
    if (!(at >= last.start && at < last.end)) err('V8', `title_card.at(${at})은 마지막 샷 구간 [${last.start}, ${last.end}) 안이어야 함`);
  }

  // V4 — 프롬프트 길이 (구조 에러가 없고 렌더러가 주어졌을 때만)
  let promptChars = null;
  if (!errors.length && typeof renderPrompt === 'function') {
    try {
      promptChars = renderPrompt(sb).length;
      if (promptChars > L.maxPromptChars) err('V4', `H3 프롬프트 ${promptChars}자 — 상한 ${L.maxPromptChars}. 샷 묘사를 줄여라`);
    } catch (e) {
      err('V4', `H3 프롬프트 렌더 실패: ${e.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: { syllables, cues: cues.length, shots: shots.length, panels: panels.length, promptChars },
  };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts
git commit -m "feat(skill): storyboard.json 검증기 V1~V9와 카프카 변신 픽스처

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: render-h3.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-h3.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/render-h3.test.mjs`

**Interfaces:**
- Consumes: `toH3Timecode` (timecode.mjs), `cameraPhrase` (camera.mjs)
- Produces: `cuesForShot(sb, shot) → cue[]` — `cue.start ∈ [shot.start, shot.end)`
- Produces: `renderH3Prompt(sb) → string` — 3필드 텍스트. Task 9가 `validateStoryboard(sb, evidence, { renderPrompt: renderH3Prompt })`로 넘긴다

- [ ] **Step 1: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-h3.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderH3Prompt, cuesForShot } from './render-h3.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const out = renderH3Prompt(fixture);

test('3필드 라벨이 순서대로 있다', () => {
  const a = out.indexOf('integrated_multimodal_description:');
  const b = out.indexOf('overall_soundscape:');
  const c = out.indexOf('non_diegetic_music:');
  assert.ok(a === 0 && a < b && b < c);
});

test('프리앰블: 스타일 락·세로·88% 규칙·텍스트 금지·내레이터 정의', () => {
  assert.ok(out.includes(fixture.style_lock));
  assert.ok(out.includes('Vertical 9:16 portrait video, 15 seconds, 3 shots'));
  assert.ok(out.includes('central 88% of the frame width'));
  assert.ok(out.includes('Do not render any on-screen text'));
  assert.ok(out.includes(`Recurring on-screen character: ${fixture.character_sheet}`));
  assert.ok(out.includes('(S1) is the narrator and never appears on screen'));
});

test('샷 라벨과 타임코드', () => {
  assert.ok(out.includes('[Shot 1] A gaunt man lying in a narrow bed'));
  assert.ok(out.includes('[Shot 2] At 00:03.000, the camera cuts to a low angle'));
  assert.ok(out.includes('[Shot 3] At 00:10.500, the camera cuts to a wide view'));
});

test('카메라·SFX·보이스오버 대사가 샷 안에 있다', () => {
  assert.ok(out.includes('The camera pushes in with small amplitude at slow speed toward his wide-open eyes.'));
  assert.ok(out.includes('The muffled ticking of an alarm clock.'));
  assert.ok(out.includes("(S1) says in an off-screen voiceover while every on-screen character's lips remain completely closed: <d>[Korean] 아침에 눈을 떴는데</d>"));
  assert.ok(out.includes('<d>[Korean] 몸이 벌레로 변해 있었다 가족은 그를 방에 가뒀고 세상은 아무 일 없다는 듯</d>'));
  assert.ok(out.includes('<d>[Korean] 출근을 재촉했다 카프카, 변신</d>'));
});

test('cuesForShot: start 기준 귀속', () => {
  const [s1, s2, s3] = fixture.shots;
  assert.deepEqual(cuesForShot(fixture, s1).map((c) => c.text_ko), ['아침에 눈을 떴는데']);
  assert.equal(cuesForShot(fixture, s2).length, 3);
  assert.equal(cuesForShot(fixture, s3).length, 2);
});

test('큐 없는 샷은 보이스오버 문장을 생략한다', () => {
  const sb = structuredClone(fixture);
  sb.narration = sb.narration.filter((c) => c.start >= 3);
  const shot1 = renderH3Prompt(sb).split('\n').find((l) => l.startsWith('[Shot 1]'));
  assert.ok(!shot1.includes('<d>'));
});

test('character_sheet가 비면 내레이터 정의만 남는다', () => {
  const sb = structuredClone(fixture);
  sb.character_sheet = '';
  const o = renderH3Prompt(sb);
  assert.ok(!o.includes('Recurring on-screen character'));
  assert.ok(o.includes('(S1) is the narrator and never appears on screen'));
});

test('soundscape·music 본문 포함', () => {
  assert.ok(out.includes(fixture.overall_soundscape));
  assert.ok(out.includes(fixture.non_diegetic_music));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — `render-h3.mjs` 없음

- [ ] **Step 3: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-h3.mjs`:

```js
import { toH3Timecode } from './timecode.mjs';
import { cameraPhrase } from './camera.mjs';

/**
 * MiniMax H3 프롬프트 조립. 문법 정본: references/h3-prompt-spec.md
 * - 3필드: integrated_multimodal_description / overall_soundscape / non_diegetic_music
 * - [Shot N], 두 번째 샷부터 "At MM:SS.mmm, the camera cuts to …"
 * - 보이스오버는 (S1) + <d>[Korean] …</d>, 입은 닫은 채
 * - 똑똑 피드가 좌우 6%를 자르므로 중앙 88% 구도를 지시
 * - 자막은 후처리 번인이므로 화면 텍스트 생성을 금지
 */
const FRAME_RULE = 'Keep every key subject and face inside the central 88% of the frame width — the outer 6% on each side is cropped by the player.';
const NO_TEXT_RULE = 'Do not render any on-screen text, captions, subtitles, titles, or lettering anywhere in the video.';
const NARRATOR_RULE = '(S1) is the narrator and never appears on screen.';
const VOICEOVER = "(S1) says in an off-screen voiceover while every on-screen character's lips remain completely closed:";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const period = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function cuesForShot(sb, shot) {
  return (sb.narration ?? []).filter((c) => c.start >= shot.start && c.start < shot.end);
}

export function renderH3Prompt(sb) {
  const out = [];
  out.push('integrated_multimodal_description:');
  out.push(`${period(sb.style_lock)} Vertical 9:16 portrait video, ${sb.duration_sec} seconds, ${sb.shots.length} shots. ${FRAME_RULE} ${NO_TEXT_RULE}`);
  out.push(sb.character_sheet?.trim()
    ? `Recurring on-screen character: ${period(sb.character_sheet)} Preserve these features in every shot. ${NARRATOR_RULE}`
    : NARRATOR_RULE);
  out.push('');

  sb.shots.forEach((shot, i) => {
    const head = i === 0
      ? `[Shot ${shot.n}] ${period(cap(shot.description))}`
      : `[Shot ${shot.n}] At ${toH3Timecode(shot.start)}, the camera cuts to ${period(lower(shot.description))}`;
    const parts = [head, period(cameraPhrase(shot.camera))];
    if (shot.sfx?.trim()) parts.push(period(cap(shot.sfx)));
    const cues = cuesForShot(sb, shot);
    if (cues.length) parts.push(`${VOICEOVER} <d>[Korean] ${cues.map((c) => c.text_ko.trim()).join(' ')}</d>`);
    out.push(parts.join(' '));
  });

  out.push('');
  out.push('overall_soundscape:');
  out.push(sb.overall_soundscape.trim());
  out.push('');
  out.push('non_diegetic_music:');
  out.push(sb.non_diegetic_music.trim());
  return out.join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): storyboard.json → MiniMax H3 3필드 프롬프트 렌더러

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: render-ass.mjs · render-burn.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-ass.mjs`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-burn.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/render-ass.test.mjs`

**Interfaces:**
- Consumes: `toAssTimecode` (timecode.mjs), `wrapCue` (text.mjs)
- Produces: `renderAss(sb) → string` — BOM 없는 순수 텍스트. BOM은 Task 9의 파일 쓰기에서 붙인다
- Produces: `renderBurnPs1() → string` — 고정 PowerShell 스크립트

- [ ] **Step 1: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-ass.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAss } from './render-ass.mjs';
import { renderBurnPs1 } from './render-burn.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const ass = renderAss(fixture);

test('헤더: PlayRes 1440×2560', () => {
  assert.ok(ass.startsWith('[Script Info]'));
  assert.ok(ass.includes('PlayResX: 1440'));
  assert.ok(ass.includes('PlayResY: 2560'));
});

test('스타일 2개: Sub(하단 중앙, 마진 288/384) · Title(정중앙)', () => {
  assert.ok(ass.includes('Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1'));
  assert.ok(ass.includes('Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1'));
});

test('큐 → Dialogue, 12자 줄바꿈은 \\N', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:00.40,0:00:02.80,Sub,,0,0,0,,아침에 눈을 떴는데'));
  assert.ok(ass.includes('Dialogue: 0,0:00:03.20,0:00:05.80,Sub,,0,0,0,,몸이 벌레로 변해\\N있었다'));
});

test('제목 카드: Title 스타일, at부터 끝까지', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:12.50,0:00:15.00,Title,,0,0,0,,변신 · 프란츠 카프카'));
});

test('큐는 start 순으로 정렬된다', () => {
  const sb = structuredClone(fixture);
  sb.narration.reverse();
  const lines = renderAss(sb).split('\n').filter((l) => l.includes(',Sub,'));
  assert.ok(lines[0].includes('0:00:00.40'));
});

test('중괄호는 이스케이프', () => {
  const sb = structuredClone(fixture);
  sb.narration[0].text_ko = '가나{다}';
  assert.ok(renderAss(sb).includes('가나\\{다\\}'));
});

test('burn.ps1: 상대 경로 ass 필터, ffmpeg·입력 파일 검사', () => {
  const ps = renderBurnPs1();
  assert.ok(ps.includes('Set-Location $PSScriptRoot'));
  assert.ok(ps.includes('-vf "ass=subtitles.ass"'));
  assert.ok(ps.includes('Get-Command ffmpeg'));
  assert.ok(ps.includes('Test-Path $In'));
  assert.ok(ps.includes('-c:a copy'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-ass.mjs`:

```js
import { toAssTimecode } from './timecode.mjs';
import { wrapCue } from './text.mjs';

/**
 * ASS 자막. 좌표 근거: references/ttokttok-delivery.md
 * - 1440×2560 기준. 좌우 인셋 20%(288px) = 피드 크롭 6% + 크롬 세이프 14%
 * - 하단 마진 15%(384px) = 도서 정보 바 96 CSS px
 * - Sub: 72px, Alignment 2(하단 중앙). Title: 96px, Alignment 5(정중앙)
 */
const HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 1440',
  'PlayResY: 2560',
  'WrapStyle: 2',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1',
  'Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
];

const esc = (t) => String(t).replace(/[{}]/g, (m) => `\\${m}`).replace(/\r?\n/g, ' ');

export function renderAss(sb) {
  const lines = [...HEADER];
  const cues = [...(sb.narration ?? [])].sort((a, b) => a.start - b.start);
  for (const c of cues) {
    const text = wrapCue(c.text_ko).map(esc).join('\\N');
    lines.push(`Dialogue: 0,${toAssTimecode(c.start)},${toAssTimecode(c.end)},Sub,,0,0,0,,${text}`);
  }
  lines.push(`Dialogue: 0,${toAssTimecode(sb.title_card.at)},${toAssTimecode(sb.duration_sec)},Title,,0,0,0,,${esc(sb.title_card.text_ko)}`);
  return lines.join('\n') + '\n';
}
```

`.claude/skills/book-shorts-storyboard/scripts/lib/render-burn.mjs`:

```js
/**
 * ffmpeg 번인 스크립트 (PowerShell 5.1). BOM은 파일 쓰기에서 붙인다.
 * Set-Location으로 상대 경로를 쓰는 이유: libass 필터 인자에 드라이브 콜론(C:)이
 * 들어가면 이스케이프가 필요해 깨지기 쉽다.
 */
export function renderBurnPs1() {
  return `param(
  [string]$In = "input.mp4",
  [string]$Out = "output.mp4"
)
# 도서 소개 쇼츠 — 자막 번인. 생성: book-shorts-storyboard 스킬
# 사용: H3에서 받은 mp4를 이 폴더에 input.mp4로 두고 실행. 결과는 output.mp4
Set-Location $PSScriptRoot

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "ffmpeg가 없습니다. 설치: winget install Gyan.FFmpeg"
  exit 1
}
if (-not (Test-Path $In)) {
  Write-Error "$In 이(가) 없습니다. H3에서 받은 mp4를 이 이름으로 두세요 (또는 -In 경로)."
  exit 1
}

# 폰트를 못 찾으면 -vf 를 "ass=subtitles.ass:fontsdir=C\\:/Windows/Fonts" 로 바꾼다
ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg 실패 (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "완료: $Out"
`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): ASS 자막 렌더러와 ffmpeg 번인 스크립트 생성기

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: render-panels.mjs · codex-panels.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-panels.mjs`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/codex-panels.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/render-panels.test.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/codex-panels.test.mjs`

**Interfaces:**
- Produces: `panelFileName(id) → 'panels/panel-<id>.png'`
- Produces: `renderPanelPrompt(sb, panel) → string`, `renderPanelPrompts(sb) → {id, file, prompt}[]`, `renderPanelPromptsText(sb) → string`
- Produces: `CODEX_ARGS: string[]`, `INSTRUCTION_FILE = 'panel-instruction.txt'`, `buildPanelInstruction(jobs) → string`
- Produces: `generatePanels(dir, sb, { force?, timeoutMs?, runner? }) → { ran, generated[], skipped[], missing[], status?, error?, stderrTail? }`. `runner(args, cwd, timeoutMs) → { status, stdout, stderr, error? }` — 기본은 `spawnSync('codex', …, { shell: true })`, 테스트는 가짜를 주입

- [ ] **Step 1: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-panels.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelFileName, renderPanelPrompt, renderPanelPrompts, renderPanelPromptsText } from './render-panels.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));

test('파일명 규칙', () => {
  assert.equal(panelFileName('01'), 'panels/panel-01.png');
});

test('모든 패널 프롬프트에 style_lock·character_sheet·세로·텍스트 금지가 들어간다', () => {
  const jobs = renderPanelPrompts(fixture);
  assert.equal(jobs.length, 5);
  for (const j of jobs) {
    assert.ok(j.prompt.includes(fixture.style_lock), j.id);
    assert.ok(j.prompt.includes(`Character: ${fixture.character_sheet}`), j.id);
    assert.ok(j.prompt.includes('Vertical 9:16 portrait composition'), j.id);
    assert.ok(j.prompt.includes('No text, no lettering'), j.id);
  }
});

test('샷 타입이 문장 선두에 온다', () => {
  const p = renderPanelPrompt(fixture, fixture.panels[0]);
  assert.ok(p.startsWith('Medium close-up of a gaunt man lying in bed'));
});

test('character_sheet가 비면 Character 절 생략', () => {
  const sb = structuredClone(fixture);
  sb.character_sheet = '';
  assert.ok(!renderPanelPrompt(sb, sb.panels[0]).includes('Character:'));
});

test('텍스트 묶음은 파일명 헤더 + 프롬프트', () => {
  const t = renderPanelPromptsText(fixture);
  assert.ok(t.includes('## panels/panel-01.png'));
  assert.ok(t.includes('## panels/panel-05.png'));
});
```

`.claude/skills/book-shorts-storyboard/scripts/lib/codex-panels.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CODEX_ARGS, INSTRUCTION_FILE, buildPanelInstruction, generatePanels } from './codex-panels.mjs';
import { renderPanelPrompts } from './render-panels.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const tmp = () => mkdtempSync(join(tmpdir(), 'panels-'));

test('CODEX_ARGS는 우회 플래그 두 개를 포함한다', () => {
  assert.deepEqual(CODEX_ARGS, ['exec', '-c', 'service_tier=fast', '-c', 'model=gpt-5.5', '--skip-git-repo-check']);
});

test('지시문: 내장 image_gen·세로·패널별 파일 경로·프롬프트', () => {
  const jobs = renderPanelPrompts(fixture);
  const s = buildPanelInstruction(jobs);
  assert.ok(s.includes('built-in image_gen'));
  assert.ok(s.includes('VERTICAL PORTRAIT'));
  for (const j of jobs) {
    assert.ok(s.includes(`### ${j.file}`));
    assert.ok(s.includes(j.prompt));
  }
});

test('generatePanels: 지시문 파일을 쓰고 runner를 cwd=dir로 호출, 생성/누락을 보고', () => {
  const dir = tmp();
  const calls = [];
  const runner = (args, cwd) => {
    calls.push({ args, cwd });
    // 가짜: 1,2번만 만든다
    mkdirSync(join(cwd, 'panels'), { recursive: true });
    writeFileSync(join(cwd, 'panels/panel-01.png'), 'x');
    writeFileSync(join(cwd, 'panels/panel-02.png'), 'x');
    return { status: 0, stdout: '', stderr: '' };
  };
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.ran, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, dir);
  assert.deepEqual(calls[0].args.slice(0, CODEX_ARGS.length), CODEX_ARGS);
  assert.ok(calls[0].args.at(-1).includes(INSTRUCTION_FILE));
  assert.ok(existsSync(join(dir, INSTRUCTION_FILE)));
  assert.deepEqual(r.generated, ['panels/panel-01.png', 'panels/panel-02.png']);
  assert.deepEqual(r.missing, ['panels/panel-03.png', 'panels/panel-04.png', 'panels/panel-05.png']);
});

test('generatePanels: 이미 있는 패널은 건너뛴다, force면 다시', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'panels'));
  for (const n of ['01', '02', '03', '04', '05']) writeFileSync(join(dir, `panels/panel-${n}.png`), 'x');
  let called = 0;
  const runner = () => { called++; return { status: 0, stdout: '', stderr: '' }; };
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.ran, false);
  assert.equal(called, 0);
  assert.equal(r.skipped.length, 5);
  const f = generatePanels(dir, fixture, { runner, force: true });
  assert.equal(f.ran, true);
  assert.equal(called, 1);
});

test('generatePanels: runner 에러를 보고한다', () => {
  const dir = tmp();
  const runner = () => ({ status: null, stdout: '', stderr: 'boom', error: new Error('ENOENT codex') });
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.error, 'ENOENT codex');
  assert.equal(r.missing.length, 5);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-panels.mjs`:

```js
/**
 * 콘티 패널 프롬프트 조립. 기법 근거: references/conti-panel-spec.md
 * - 샷 타입 선두 → 동작 1개 → 캐릭터 시트(반복) → 스타일 락(반복) → 세로 → 텍스트 금지
 * - "모든 프롬프트에 똑같이 반복"은 사람이 하면 틀어지므로 여기서 조립한다
 */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const period = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function panelFileName(id) {
  return `panels/panel-${id}.png`;
}

export function renderPanelPrompt(sb, panel) {
  const character = sb.character_sheet?.trim() ? `Character: ${period(sb.character_sheet)} ` : '';
  return `${cap(panel.shot_type)} of ${period(panel.action)} ${character}${period(sb.style_lock)} Vertical 9:16 portrait composition, single storyboard panel. No text, no lettering, no captions, no watermark, no panel border.`;
}

export function renderPanelPrompts(sb) {
  return (sb.panels ?? []).map((p) => ({ id: p.id, file: panelFileName(p.id), prompt: renderPanelPrompt(sb, p) }));
}

export function renderPanelPromptsText(sb) {
  return renderPanelPrompts(sb).map((j) => `## ${j.file}\n${j.prompt}\n`).join('\n');
}
```

`.claude/skills/book-shorts-storyboard/scripts/lib/codex-panels.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPanelPrompts } from './render-panels.mjs';

/**
 * Codex 내장 image_gen으로 패널을 생성한다. 호출 경로 진단: references/conti-panel-spec.md
 *
 * CODEX_ARGS — 이 두 오버라이드가 없으면 CLI 0.128.0이 앱 config(service_tier=priority,
 * model=gpt-5.6-sol)를 소화하지 못해 빈 출력 또는 400으로 죽는다 (2026-09-03 실측).
 * 바뀌면 여기 한 곳만 고친다.
 */
export const CODEX_ARGS = ['exec', '-c', 'service_tier=fast', '-c', 'model=gpt-5.5', '--skip-git-repo-check'];
export const INSTRUCTION_FILE = 'panel-instruction.txt';

/** 세션 1회로 전 패널을 만든다 — 패널마다 세션을 띄우면 분 단위로 낭비된다. */
export function buildPanelInstruction(jobs) {
  return [
    'Use the imagegen skill with the built-in image_gen tool (do NOT use the CLI fallback, do NOT ask for OPENAI_API_KEY).',
    `Generate ${jobs.length} storyboard panel images, one image_gen call per panel, each in VERTICAL PORTRAIT orientation (clearly taller than wide, 9:16).`,
    'After each generation, copy the produced PNG from $CODEX_HOME/generated_images into the current working directory at the exact relative path given below (create the panels/ folder if missing).',
    'Do not create, modify, or delete any other file. Never add text or lettering to the images.',
    '',
    ...jobs.flatMap((j) => [`### ${j.file}`, j.prompt, '']),
    'When every file listed above exists, reply with the list of written paths and nothing else.',
  ].join('\n');
}

export function defaultRunner(args, cwd, timeoutMs) {
  const r = spawnSync('codex', args, {
    cwd,
    shell: true, // Windows에서 codex.cmd 실행에 필요
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

export function generatePanels(dir, sb, { force = false, timeoutMs = 600_000, runner = defaultRunner } = {}) {
  const all = renderPanelPrompts(sb);
  const jobs = force ? all : all.filter((j) => !existsSync(join(dir, j.file)));
  const skipped = all.filter((j) => !jobs.includes(j)).map((j) => j.file);
  if (!jobs.length) return { ran: false, generated: [], skipped, missing: [] };

  mkdirSync(join(dir, 'panels'), { recursive: true });
  writeFileSync(join(dir, INSTRUCTION_FILE), buildPanelInstruction(jobs), 'utf8');
  // 프롬프트를 인자로 넘기지 않고 파일로 읽게 한다 — 셸 인용 문제를 피한다
  const prompt = `Read ${INSTRUCTION_FILE} in the current working directory and follow it exactly.`;
  const res = runner([...CODEX_ARGS, JSON.stringify(prompt)], dir, timeoutMs);

  const generated = jobs.filter((j) => existsSync(join(dir, j.file))).map((j) => j.file);
  const missing = jobs.filter((j) => !existsSync(join(dir, j.file))).map((j) => j.file);
  return {
    ran: true,
    generated,
    skipped,
    missing,
    status: res.status ?? null,
    error: res.error?.message ?? null,
    stderrTail: String(res.stderr ?? '').slice(-2000),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): 콘티 패널 프롬프트 조립과 Codex image_gen 배치 호출

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: contisheet.html 템플릿 · render-sheet.mjs · sheet-png.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/templates/contisheet.html`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-sheet.mjs`
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/sheet-png.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/render-sheet.test.mjs`

**Interfaces:**
- Consumes: `toH3Timecode` (timecode.mjs), `panelFileName`, `renderPanelPrompt` (render-panels.mjs)
- Produces: `renderContiSheet(sb, template, { panelExists, evidence }) → string` — `panelExists(file) → boolean`은 Task 9가 `existsSync`로 넘긴다
- Produces: `findBrowser(candidates?) → string|null`, `sheetHeight(panelCount) → number`, `captureSheetPng(htmlPath, pngPath, height, { browser?, runner? }) → { ok, browser?, reason? }`

- [ ] **Step 1: 템플릿 작성**

`.claude/skills/book-shorts-storyboard/templates/contisheet.html`:

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>{{TITLE}} — 콘티</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f4f5; font-family: "Malgun Gothic", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif; color: #18181b; }
  .sheet { width: 1600px; margin: 0 auto; background: #fff; border: 1px solid #d4d4d8; }
  header { display: flex; justify-content: space-between; align-items: baseline; padding: 36px 48px 20px; border-bottom: 1px solid #e4e4e7; }
  header h1 { margin: 0; font-size: 28px; font-weight: 700; }
  header h1 small { font-size: 16px; font-weight: 400; color: #52525b; margin-left: 12px; }
  header .meta { font-size: 14px; color: #52525b; text-align: right; line-height: 1.6; }
  .cols { display: grid; grid-template-columns: 1fr 240px 1fr; padding: 14px 48px 0; font-size: 13px; letter-spacing: .08em; color: #71717a; text-align: center; }
  .row { display: grid; grid-template-columns: 1fr 240px 1fr; gap: 28px; align-items: center; padding: 22px 48px; border-bottom: 1px dashed #e4e4e7; }
  .row:last-of-type { border-bottom: 0; }
  .note { font-size: 16px; line-height: 1.7; }
  .note .shot { font-size: 12px; letter-spacing: .06em; color: #71717a; margin-bottom: 8px; }
  .note.video { text-align: right; padding-right: 8px; }
  .note.audio { padding-left: 8px; }
  .note.audio p { margin: 0 0 6px; }
  .panel { width: 200px; aspect-ratio: 9 / 16; margin: 0 auto; border: 1.5px solid #27272a; border-radius: 8px; overflow: hidden; background: #fafafa; display: flex; align-items: center; justify-content: center; }
  .panel img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .panel .placeholder { padding: 14px; font-size: 11px; line-height: 1.5; color: #52525b; }
  .panel .placeholder b { display: block; font-size: 12px; margin-bottom: 8px; color: #18181b; }
  footer { padding: 22px 48px 36px; border-top: 1px solid #e4e4e7; font-size: 13px; color: #52525b; line-height: 1.7; }
  footer b { color: #18181b; }
  @media print { body { background: #fff; } .sheet { border: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <h1>{{TITLE}}<small>{{AUTHOR}}</small></h1>
    <div class="meta">{{CONCEPT}}<br>{{DURATION}}초 · 9:16 · 패널 {{PANEL_COUNT}}</div>
  </header>
  <div class="cols"><div>&lt; VIDEO &gt;</div><div></div><div>&lt; AUDIO &gt;</div></div>
{{ROWS}}
  <footer>{{EVIDENCE}}</footer>
</div>
</body>
</html>
```

- [ ] **Step 2: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-sheet.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderContiSheet } from './render-sheet.mjs';
import { sheetHeight, findBrowser } from './sheet-png.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const template = readFileSync(new URL('../../templates/contisheet.html', here), 'utf8');

test('헤더 토큰이 치환된다', () => {
  const html = renderContiSheet(fixture, template, { evidence });
  assert.ok(html.includes('<h1>변신<small>프란츠 카프카</small></h1>'));
  assert.ok(html.includes('curiosity-gap'));
  assert.ok(html.includes('15초 · 9:16 · 패널 5'));
  assert.ok(!html.includes('{{'));
});

test('패널 행: VIDEO 노트·이미지 또는 플레이스홀더·AUDIO 노트', () => {
  const html = renderContiSheet(fixture, template, { evidence, panelExists: (f) => f === 'panels/panel-01.png' });
  assert.ok(html.includes('<img src="panels/panel-01.png"'));
  assert.ok(!html.includes('<img src="panels/panel-02.png"'));
  assert.ok(html.includes('panel-02'));                       // 플레이스홀더에 이름
  assert.ok(html.includes('Extreme close-up of the man'));    // 플레이스홀더에 프롬프트
  assert.ok(html.includes('Shot 1 · 00:00.000–00:03.000'));
  assert.ok(html.includes('어두운 방, 침대에 누운 그레고르'));
  assert.ok(html.includes('<p>NA) 아침에 눈을 떴는데</p>'));
  assert.ok(html.includes('<p>S.E) 알람 시계 초침 소리</p>'));
});

test('HTML 이스케이프', () => {
  const sb = structuredClone(fixture);
  sb.panels[0].video_note_ko = '<b>굵게</b> & 기호';
  const html = renderContiSheet(sb, template, { evidence });
  assert.ok(html.includes('&lt;b&gt;굵게&lt;/b&gt; &amp; 기호'));
});

test('푸터에 선택 컨셉 근거가 등급과 함께', () => {
  const html = renderContiSheet(fixture, template, { evidence });
  assert.ok(html.includes('A-2'));
  assert.ok(html.includes('[A]'));
  assert.ok(html.includes('Loewenstein'));
});

test('sheetHeight / findBrowser', () => {
  assert.equal(sheetHeight(5), 200 + 5 * 380 + 120);
  assert.equal(findBrowser(['Z:/nope.exe']), null);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-sheet.mjs`:

```js
import { toH3Timecode } from './timecode.mjs';
import { panelFileName, renderPanelPrompt } from './render-panels.mjs';

/**
 * 콘티 시트 HTML. 레이아웃 = VIDEO 노트 │ 9:16 패널 │ AUDIO 노트, 행 = 패널.
 * 한글 텍스트는 이미지 모델에 맡기지 않고 여기서 조판한다.
 */
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function audioLines(note) {
  return String(note ?? '').split(/\s\/\s/).map((s) => s.trim()).filter(Boolean);
}

function renderRow(sb, panel, panelExists) {
  const shot = sb.shots.find((s) => s.n === panel.shot);
  const file = panelFileName(panel.id);
  const media = panelExists(file)
    ? `<img src="${file}" alt="">`
    : `<div class="placeholder"><b>panel-${escapeHtml(panel.id)}</b>${escapeHtml(renderPanelPrompt(sb, panel))}</div>`;
  const audio = audioLines(panel.audio_note_ko).map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return `  <section class="row">
    <div class="note video"><div class="shot">Shot ${shot.n} · ${toH3Timecode(shot.start)}–${toH3Timecode(shot.end)}</div>${escapeHtml(panel.video_note_ko)}</div>
    <div class="panel">${media}</div>
    <div class="note audio">${audio}</div>
  </section>`;
}

function renderEvidence(sb, evidence) {
  const c = sb.concepts.find((x) => x.id === sb.selected_concept);
  if (!c) return '';
  const items = (c.evidence ?? []).map((id) => {
    const e = evidence[id];
    return e ? `<b>${id}</b> [${e.grade}] ${escapeHtml(e.claim_ko)} — ${escapeHtml(e.source)}` : `<b>${id}</b> (미등록)`;
  });
  return `근거 · ${escapeHtml(c.hook_type)} × ${escapeHtml(c.tone)}<br>${items.join('<br>')}`;
}

export function renderContiSheet(sb, template, { panelExists = () => false, evidence = {} } = {}) {
  const concept = sb.concepts.find((x) => x.id === sb.selected_concept);
  const rows = sb.panels.map((p) => renderRow(sb, p, panelExists)).join('\n');
  return template
    .replaceAll('{{TITLE}}', escapeHtml(sb.book.title))
    .replaceAll('{{AUTHOR}}', escapeHtml(sb.book.author ?? ''))
    .replaceAll('{{CONCEPT}}', concept ? `${escapeHtml(concept.hook_type)} × ${escapeHtml(concept.tone)} × ${escapeHtml(concept.visual_style)}` : '')
    .replaceAll('{{DURATION}}', String(sb.duration_sec))
    .replaceAll('{{PANEL_COUNT}}', String(sb.panels.length))
    .replaceAll('{{ROWS}}', rows)
    .replaceAll('{{EVIDENCE}}', renderEvidence(sb, evidence));
}
```

`.claude/skills/book-shorts-storyboard/scripts/lib/sheet-png.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 헤드리스 캡처용 브라우저 후보. 이 PC에는 Edge(x86 경로)와 Chrome이 있다. */
export const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

export function findBrowser(candidates = BROWSER_CANDIDATES) {
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 시트 높이 = 헤더 200 + 패널 행 380씩 + 푸터 120 */
export function sheetHeight(panelCount) {
  return 200 + panelCount * 380 + 120;
}

export function captureSheetPng(htmlPath, pngPath, height, { browser = findBrowser(), runner = spawnSync } = {}) {
  if (!browser) return { ok: false, reason: 'no-browser' };
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3000',
    `--screenshot=${pngPath}`, `--window-size=1600,${height}`,
    pathToFileURL(htmlPath).href,
  ];
  const r = runner(browser, args, { encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
  if (existsSync(pngPath)) return { ok: true, browser };
  return { ok: false, reason: 'no-output', status: r.status ?? null, stderr: String(r.stderr ?? '').slice(-1000) };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/templates .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): 콘티 시트 HTML 조판과 Edge 헤드리스 PNG 캡처

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: render-md.mjs

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/lib/render-md.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/lib/render-md.test.mjs`

**Interfaces:**
- Consumes: `toH3Timecode`, `cameraPhrase`, `wrapCue`, `cuesForShot`
- Produces: `renderStoryboardMd(sb, report, evidence) → string`. `report`는 `validateStoryboard`의 반환값

- [ ] **Step 1: 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-md.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStoryboardMd } from './render-md.mjs';
import { validateStoryboard } from './validate.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const md = renderStoryboardMd(fixture, validateStoryboard(fixture, evidence), evidence);

test('제목·선택 컨셉·근거 표', () => {
  assert.ok(md.startsWith('# 변신 — 15초 쇼츠 스토리보드'));
  assert.ok(md.includes('## 컨셉 A · curiosity-gap × unsettling × ink-line-art'));
  assert.ok(md.includes('| A-2 | A |'));
  assert.ok(md.includes('Loewenstein'));
});

test('기각안 2개가 한 줄씩', () => {
  assert.ok(md.includes('- **B** pattern-interrupt × deadpan-humor'));
  assert.ok(md.includes('- **C** bold-claim × awe'));
});

test('타임라인 표: 샷·구간·카메라·내레이션', () => {
  assert.ok(md.includes('| 1 | 00:00.000–00:03.000 |'));
  assert.ok(md.includes('The camera pushes in with small amplitude at slow speed toward his wide-open eyes'));
  assert.ok(md.includes('아침에 눈을 떴는데'));
});

test('자막 큐 표와 음절 메트릭', () => {
  assert.ok(md.includes('| 0:00:03.20 | 0:00:05.80 | 몸이 벌레로 변해 / 있었다 |'));
  assert.ok(md.includes('50음절'));
});

test('제작 절차와 파일 목록', () => {
  assert.ok(md.includes('h3-prompt.txt'));
  assert.ok(md.includes('burn.ps1'));
  assert.ok(md.includes('input.mp4'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`.claude/skills/book-shorts-storyboard/scripts/lib/render-md.mjs`:

```js
import { toH3Timecode, toAssTimecode } from './timecode.mjs';
import { cameraPhrase } from './camera.mjs';
import { wrapCue } from './text.mjs';
import { cuesForShot } from './render-h3.mjs';

/** 사람용 기획서. storyboard.json에서 전부 파생한다 — 손으로 고치지 말고 JSON을 고친다. */
export function renderStoryboardMd(sb, report, evidence) {
  const sel = sb.concepts.find((c) => c.id === sb.selected_concept);
  const others = sb.concepts.filter((c) => c.id !== sb.selected_concept);
  const ev = (id) => evidence[id];
  const out = [];

  out.push(`# ${sb.book.title} — ${sb.duration_sec}초 쇼츠 스토리보드`);
  out.push('');
  out.push(`${sb.book.author ?? ''} · 생성: book-shorts-storyboard 스킬 · 원본: \`storyboard.json\` (이 문서는 파생물 — JSON을 고치고 다시 빌드한다)`);
  out.push('');
  out.push(`## 컨셉 ${sel.id} · ${sel.hook_type} × ${sel.tone} × ${sel.visual_style}`);
  out.push('');
  out.push(`**훅:** ${sel.hook_line_ko}`);
  out.push('');
  out.push(`**왜 이 책인가:** ${sel.why_this_book_ko}`);
  out.push('');
  out.push('| 근거 | 등급 | 주장 | 출처 |');
  out.push('|---|---|---|---|');
  for (const id of sel.evidence) {
    const e = ev(id);
    out.push(e ? `| ${id} | ${e.grade} | ${e.claim_ko} | [${e.source}](${e.url}) |` : `| ${id} | ? | (evidence.json에 없음) | |`);
  }
  out.push('');
  out.push('### 기각안');
  out.push('');
  for (const c of others) out.push(`- **${c.id}** ${c.hook_type} × ${c.tone} × ${c.visual_style} — "${c.hook_line_ko}" (주근거 ${c.primary_evidence})`);
  out.push('');

  out.push('## 타임라인');
  out.push('');
  out.push(`스타일 락: ${sb.style_lock}${sb.character_sheet ? ` · 캐릭터: ${sb.character_sheet}` : ''}`);
  out.push('');
  out.push('| 샷 | 구간 | 화면 | 카메라 | SFX | 내레이션 |');
  out.push('|---|---|---|---|---|---|');
  for (const s of sb.shots) {
    const na = cuesForShot(sb, s).map((c) => c.text_ko).join(' / ');
    out.push(`| ${s.n} | ${toH3Timecode(s.start)}–${toH3Timecode(s.end)} | ${s.description} | ${cameraPhrase(s.camera)} | ${s.sfx ?? ''} | ${na} |`);
  }
  out.push('');
  out.push(`앰비언스: ${sb.overall_soundscape}`);
  out.push('');
  out.push(`BGM: ${sb.non_diegetic_music}`);
  out.push('');

  out.push('## 자막 큐');
  out.push('');
  out.push(`총 ${report.metrics.syllables}음절 (상한 75) · 큐 ${report.metrics.cues}개 · 제목 카드 ${sb.title_card.at}s "${sb.title_card.text_ko}"`);
  out.push('');
  out.push('| 시작 | 끝 | 자막 (줄바꿈 = /) |');
  out.push('|---|---|---|');
  for (const c of [...sb.narration].sort((a, b) => a.start - b.start)) {
    out.push(`| ${toAssTimecode(c.start)} | ${toAssTimecode(c.end)} | ${wrapCue(c.text_ko).join(' / ')} |`);
  }
  out.push('');

  out.push('## 콘티');
  out.push('');
  out.push('시트: `contisheet.html` / `contisheet.png` · 패널: `panels/` · 프롬프트: `panel-prompts.txt`');
  out.push('');
  out.push('| # | 샷 | 샷 타입 | VIDEO | AUDIO |');
  out.push('|---|---|---|---|---|');
  for (const p of sb.panels) out.push(`| ${p.id} | ${p.shot} | ${p.shot_type} | ${p.video_note_ko} | ${p.audio_note_ko} |`);
  out.push('');

  out.push('## 제작 절차');
  out.push('');
  out.push('1. `h3-prompt.txt` 내용을 MiniMax H3(Hailuo)에 붙여넣기 — 9:16, 15초, 1440p. 레퍼런스가 필요하면 `panels/`의 PNG를 최대 9장 첨부');
  out.push('2. 결과 mp4를 이 폴더에 `input.mp4`로 저장');
  out.push('3. PowerShell에서 `.\\burn.ps1` 실행 → `output.mp4` (자막 번인)');
  out.push('4. 똑똑 관리자 → 게시물 → 영상 게시물 → `output.mp4` 업로드, 도서 연결, 발행');
  out.push('');
  out.push('## 검증');
  out.push('');
  out.push(report.ok ? '통과.' : `실패: ${report.errors.map((e) => `${e.rule} ${e.message}`).join('; ')}`);
  if (report.warnings.length) out.push(`경고: ${report.warnings.map((w) => `${w.rule} ${w.message}`).join('; ')}`);
  out.push('');
  return out.join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts/lib
git commit -m "feat(skill): storyboard.md 기획서 렌더러

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: build-storyboard.mjs 진입점 · e2e · .gitignore

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs`
- Test: `.claude/skills/book-shorts-storyboard/scripts/build.test.mjs`
- Modify: `.gitignore` (끝에 추가)

**Interfaces:**
- Consumes: 앞선 모든 lib 모듈
- Produces: CLI `node build-storyboard.mjs <dir> [--panels] [--force-panels] [--no-png]`. exit 0 성공(패널·PNG 실패는 경고), 1 검증 실패, 2 사용법·파싱 오류
- Produces: `<dir>/build-report.json` — `{ ok, errors, warnings, metrics, panels?, sheetPng? }`

- [ ] **Step 1: e2e 테스트 작성**

`.claude/skills/book-shorts-storyboard/scripts/build.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./build-storyboard.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/kafka-metamorphosis.json', import.meta.url));
const run = (dir, ...flags) => spawnSync(process.execPath, [entry, dir, ...flags], { encoding: 'utf8' });
const OUTPUTS = ['build-report.json', 'storyboard.md', 'h3-prompt.txt', 'panel-prompts.txt', 'subtitles.ass', 'burn.ps1', 'contisheet.html'];
const hasBom = (buf) => buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

test('픽스처 빌드: 전 산출물 생성, exit 0, BOM', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  copyFileSync(fixture, join(dir, 'storyboard.json'));
  const r = run(dir, '--no-png');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of OUTPUTS) assert.ok(existsSync(join(dir, f)), f);
  const report = JSON.parse(readFileSync(join(dir, 'build-report.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.ok(report.metrics.promptChars > 0 && report.metrics.promptChars <= 7000);
  assert.ok(hasBom(readFileSync(join(dir, 'subtitles.ass'))));
  assert.ok(hasBom(readFileSync(join(dir, 'burn.ps1'))));
  assert.ok(!hasBom(readFileSync(join(dir, 'h3-prompt.txt'))));
  assert.ok(r.stdout.includes('검증 통과'));
  assert.ok(readFileSync(join(dir, 'contisheet.html'), 'utf8').includes('panel-01')); // 플레이스홀더
});

test('검증 실패: 리포트만 쓰고 exit 1, 다른 산출물은 만들지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  const sb = JSON.parse(readFileSync(fixture, 'utf8'));
  sb.shots = [sb.shots[0]];
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(sb));
  const r = run(dir, '--no-png');
  assert.equal(r.status, 1);
  assert.ok(existsSync(join(dir, 'build-report.json')));
  assert.ok(!existsSync(join(dir, 'h3-prompt.txt')));
  assert.ok(r.stderr.includes('V1'));
});

test('JSON 파싱 실패 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  writeFileSync(join(dir, 'storyboard.json'), '{ not json');
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('JSON'));
});

test('storyboard.json 없음 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  assert.equal(run(dir).status, 2);
});

test('인자 없음 → exit 2 + 사용법', () => {
  const r = spawnSync(process.execPath, [entry], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('사용:'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: FAIL — `build-storyboard.mjs` 없음

- [ ] **Step 3: 진입점 구현**

`.claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs`:

```js
#!/usr/bin/env node
/**
 * storyboard.json → 전 산출물.
 *   node build-storyboard.mjs <dir> [--panels] [--force-panels] [--no-png]
 * exit 0 성공 (패널·PNG 실패는 경고) · 1 검증 실패 · 2 사용법/파싱 오류
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStoryboard } from './lib/validate.mjs';
import { renderH3Prompt } from './lib/render-h3.mjs';
import { renderPanelPromptsText } from './lib/render-panels.mjs';
import { renderAss } from './lib/render-ass.mjs';
import { renderBurnPs1 } from './lib/render-burn.mjs';
import { renderStoryboardMd } from './lib/render-md.mjs';
import { renderContiSheet } from './lib/render-sheet.mjs';
import { generatePanels } from './lib/codex-panels.mjs';
import { captureSheetPng, sheetHeight } from './lib/sheet-png.mjs';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dirArg = args.find((a) => !a.startsWith('--'));

if (!dirArg) {
  console.error('사용: node build-storyboard.mjs <출력 디렉터리> [--panels] [--force-panels] [--no-png]');
  console.error('  <출력 디렉터리>/storyboard.json 을 읽어 산출물을 같은 폴더에 쓴다.');
  process.exit(2);
}

const dir = resolve(dirArg);
const sbPath = join(dir, 'storyboard.json');
if (!existsSync(sbPath)) {
  console.error(`storyboard.json 없음: ${sbPath}`);
  process.exit(2);
}

let sb;
try {
  sb = JSON.parse(readFileSync(sbPath, 'utf8'));
} catch (e) {
  console.error(`storyboard.json JSON 파싱 실패: ${e.message}`);
  process.exit(2);
}

const evidence = JSON.parse(readFileSync(join(SKILL_ROOT, 'references', 'evidence.json'), 'utf8'));
const template = readFileSync(join(SKILL_ROOT, 'templates', 'contisheet.html'), 'utf8');
const write = (name, text, { bom = false } = {}) => writeFileSync(join(dir, name), (bom ? BOM : '') + text, 'utf8');

// 1. 검증 — 실패하면 리포트만 남기고 중단 (반쪽 산출물을 남기지 않는다)
const report = validateStoryboard(sb, evidence, { renderPrompt: renderH3Prompt });
if (!report.ok) {
  write('build-report.json', JSON.stringify(report, null, 2));
  console.error(`검증 실패 (${report.errors.length}건):`);
  for (const e of report.errors) console.error(`  [${e.rule}] ${e.message}`);
  for (const w of report.warnings) console.error(`  (경고 ${w.rule}) ${w.message}`);
  process.exit(1);
}

// 2. 텍스트 산출물
write('h3-prompt.txt', renderH3Prompt(sb));
write('panel-prompts.txt', renderPanelPromptsText(sb));
write('subtitles.ass', renderAss(sb), { bom: true });
write('burn.ps1', renderBurnPs1(), { bom: true });

// 3. 패널 (선택) — codex exec 1회
if (flags.has('--panels')) {
  console.log('콘티 패널 생성 중 (codex exec, 수 분 소요)…');
  report.panels = generatePanels(dir, sb, { force: flags.has('--force-panels') });
  const p = report.panels;
  if (p.ran) console.log(`  생성 ${p.generated.length} · 건너뜀 ${p.skipped.length} · 누락 ${p.missing.length}${p.error ? ` · 오류: ${p.error}` : ''}`);
  else console.log(`  전 패널 이미 존재 (건너뜀 ${p.skipped.length}). 다시 만들려면 --force-panels`);
  if (p.missing.length) report.warnings.push({ rule: 'PANELS', message: `누락 패널: ${p.missing.join(', ')} — 시트는 플레이스홀더로 채움` });
}

// 4. 콘티 시트
const panelExists = (file) => existsSync(join(dir, file));
write('contisheet.html', renderContiSheet(sb, template, { panelExists, evidence }));
if (!flags.has('--no-png')) {
  const png = captureSheetPng(join(dir, 'contisheet.html'), join(dir, 'contisheet.png'), sheetHeight(sb.panels.length));
  report.sheetPng = png;
  if (!png.ok) report.warnings.push({ rule: 'SHEET_PNG', message: `contisheet.png 생략 (${png.reason}) — contisheet.html을 브라우저로 열어 확인` });
}

// 5. 기획서 + 리포트
write('storyboard.md', renderStoryboardMd(sb, report, evidence));
write('build-report.json', JSON.stringify(report, null, 2));

console.log(`검증 통과 · 내레이션 ${report.metrics.syllables}음절 · 큐 ${report.metrics.cues} · 샷 ${report.metrics.shots} · 패널 ${report.metrics.panels} · 프롬프트 ${report.metrics.promptChars}자`);
for (const w of report.warnings) console.log(`  (경고 ${w.rule}) ${w.message}`);
console.log(`산출물: ${dir}`);
```

- [ ] **Step 4: .gitignore 추가**

`.gitignore` 끝에:

```gitignore

# 쇼츠 스토리보드 산출물 중 대용량·재생성 가능 파일 (docs/shorts/<slug>/)
docs/shorts/*/panels/
docs/shorts/*/*.png
docs/shorts/*/*.mp4
docs/shorts/*/panel-instruction.txt
```

- [ ] **Step 5: 통과 확인**

Run: `node --test ".claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"`
Expected: `# fail 0`

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/scripts .gitignore
git commit -m "feat(skill): build-storyboard.mjs 진입점 — 검증 후 전 산출물 생성

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: references 문서 4개

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/references/h3-prompt-spec.md`
- Create: `.claude/skills/book-shorts-storyboard/references/hook-playbook.md`
- Create: `.claude/skills/book-shorts-storyboard/references/conti-panel-spec.md`
- Create: `.claude/skills/book-shorts-storyboard/references/ttokttok-delivery.md`

**Interfaces:**
- Produces: SKILL.md(Task 11)가 단계별로 읽으라고 지시하는 참조 문서. `hook-playbook.md`의 훅 유형·톤·비주얼 키는 `storyboard.json`의 `hook_type` / `tone` / `visual_style` 값으로 쓴다

- [ ] **Step 1: h3-prompt-spec.md**

```markdown
# MiniMax H3 (Hailuo 3.0) 프롬프트 정본

스크립트(`scripts/lib/render-h3.mjs`)가 이 문법으로 조립한다. 모델은 `storyboard.json`의
`shots[].description`(영문 장면 묘사), `camera`, `sfx`, `narration[].text_ko`,
`overall_soundscape`, `non_diegetic_music`만 쓴다. 문법을 직접 쓰지 않는다.

## 스펙 (2026-07-31 출시, 조사일 2026-09-03)

| 항목 | 값 |
|---|---|
| 길이 | 4~15초 정수, 단일 생성 |
| 프레임 | 24fps 고정, 1440p(2K) 기본, 9:16 지원 |
| 멀티샷 | 네이티브. 15초에 2~3컷이 통제 가능한 상한 |
| 오디오 | 네이티브 스테레오 — 대사 립싱크·SFX·룸톤 한 패스. TTS 11개 언어(한국어 포함) |
| 화면 텍스트 | 렌더 가능하지만 한글 정확도 미검증 → **금지 지시**를 넣고 자막은 번인 |
| 레퍼런스 | 이미지 9 / 영상 3(각 2~15초, 합 15초) / 오디오 3(합 15초), 총 12개 |
| 프롬프트 | 7,000자 |

## 3필드 스키마

- `integrated_multimodal_description` — 스타일·구도·인물·동작·컷 전환·대사·장면 내 소리
- `overall_soundscape` — 앰비언스·물리음 1~4문장
- `non_diegetic_music` — 관객만 듣는 음악 1~3문장. **악기·템포·다이내믹**으로, 무드 형용사 금지

## 샷 문법

- `[Shot 1] …` 첫 샷은 타임코드 없음
- `[Shot 2] At 00:03.000, the camera cuts to …` — 이후 샷은 **단조 증가** 타임코드 `MM:SS.mmm`
- 전환 동사: "the camera cuts to" / "the shot transitions to" / "the shot changes to"
- 카메라: **샷당 1개**. `type + amplitude + speed` 자연어
  `The camera pushes in with small amplitude at slow speed toward her face.`
  type: Zoom·Push·Pull·Pan·Truck·Tilt·Pedestal·Arc·Tracking·Static·Shake·POV·Roll

## 대사·내레이션

- 화자 `(S1)`, `(S2)`, 합창 `(S1,S2)`
- 대사 `<d>[Korean] 원문 그대로</d>` — 언어·문장부호 보존. 구조 필드는 영문
- 보이스오버: "says in an off-screen voiceover" + "lips remain completely closed"
- 화면 텍스트를 원하면 큰따옴표 축자. 우리는 쓰지 않는다

## 레퍼런스 이미지 정렬 (콘티 패널 재투입 시)

> For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

레퍼런스 모드 6절: `subject_definitions` / `summary` / `retention_analysis` /
`detailed_description` / `overall_soundscape` / `non_diegetic_music`. 라벨 `<Subject N>`,
`<Picture N>`, `<Video N>`, `<Audio N>`. 콘티 패널은 "Use the storyboard reference for
shot order, camera viewpoint, subject placement, and framing"로 지시.

## 우리 규칙 (렌더러가 항상 넣는 것)

- `Vertical 9:16 portrait video, N seconds, M shots.`
- **중앙 88%**: 똑똑 피드(`object-cover`)가 좌우 6%씩 자른다
- **화면 텍스트 금지**: 자막은 ASS로 번인
- `(S1) is the narrator and never appears on screen.`
- 내레이션 큐는 `cue.start`가 속한 샷에 귀속

## 출처

- https://www.minimax.io/blog/minimax-h3
- https://morphic.com/resources/models/minimax-h3
- https://minimax-h3-ai.com/blog/minimax-h3-prompt-guide/
- https://www.rundiffusion.com/minimax-h3-prompt-guide
```

- [ ] **Step 2: hook-playbook.md**

```markdown
# 훅 플레이북 — 컨셉 3안의 근거

컨셉마다 **근거 ID를 최소 1개** 인용한다. 3안은 **주근거와 훅 유형이 서로 달라야** 한다
(검증 V5). 등급은 `evidence.json`에 있다 — A 학술 / B 산업 데이터 / C 업계 주장.
C만으로 선 안은 사용자에게 `[C]`를 표시한다.

## 증거 요약

| ID | 등급 | 한 줄 | 쓰는 곳 |
|---|---|---|---|
| A-1 | A | 고각성 감정(경외·분노·불안)이 저각성(슬픔)보다 확산 우위 — Berger & Milkman 2012 | 톤 선택 |
| A-2 | A | 호기심 = 정보격차. 구체적이고 메울 수 있어야 최대 — Loewenstein 1994 | 훅 설계 |
| A-3 | A | 서사 몰입이 반론을 억제 — Green & Brock 2000 | 전개 구간 |
| A-4 | A | 미완결이 기억에 남음 (자이가르닉) | 엔딩·클리프행어 |
| B-1 | B | 71%가 첫 3초에 결정 | 훅 위치 |
| B-2 | B | 3초 유지 85%↑ → 조회수 2.8배 | 훅 강도 |
| B-3 | B | 애니메이션 완주율 70~85% vs 실사 50~65% | 비주얼 선택 |
| C-1 | C | 트로프 명시 → 인게이지먼트 3배 (북톡) | 트로프 훅 |
| C-2 | C | 최적 20~30초, 15초 미만은 훅 깊이 부족 | 구조 제약 인식 |

**증거 충돌**: 북톡 대표 훅 "이 책 읽고 3일 밤을 울었다"는 슬픔이지만 A-1은 슬픔의
확산력이 낮다고 한다. 그 훅이 작동하는 것은 **대담한 주장 + 정보격차(A-2)** 때문이고,
예고 시점의 감정은 기대·불안(고각성)이다. → *슬픔을 소재로 쓰되, 훅은 슬픔을 서술하지
말고 주장·질문으로 낸다.*

**C-2 충돌**: 15초는 권장(20~30초)보다 짧다. 그래서 **줄거리 요약이 아니라 훅 하나만
판다.** 15초 안에 "무슨 책인지"가 아니라 "왜 열어봐야 하는지"만 남기면 성공.

## 훅 유형 (`hook_type` 키)

| 키 | 정의 | 주근거 | 적용 조건 | 예 |
|---|---|---|---|---|
| `curiosity-gap` | 구체적 정보 하나를 비워 둔다. 3초 안에 답을 주지 않는다 | A-2 | 첫 장면에 시각적 이상(異常)이 있는 책 | "아침에 눈을 떴는데, 몸이 내 것이 아니었다." |
| `bold-claim` | 반박하고 싶어지는 단정 | A-1(놀람) | 명성·기록·반전이 있는 책 | "백 년 넘게 읽히는 이유가 첫 문장 하나에 있다." |
| `pattern-interrupt` | 예상 밖 병치. 비극을 무표정으로, 일상을 공포로 | A-1 | 톤을 뒤집어도 원작이 훼손되지 않는 책 | "출근 안 하면 큰일 나는 남자. 오늘은 벌레라서 못 갔다." |
| `genre-mashup` | 익숙한 두 장르를 붙인다 | A-2 | 장르가 섞인 책 | "다크 아카데미아인데 로코." |
| `trope-callout` | 트로프를 이름으로 부른다 | C-1 | 로맨스·판타지·스릴러 장르물 | "적에서 연인으로. 근데 둘 다 죽는다." |
| `direct-question` | 시청자에게 묻는다 | A-2 | 도덕적 딜레마·선택이 핵심인 책 | "당신이라면 문을 열었을까?" |
| `cliffhanger` | 사건 직전에서 끊는다 | A-4 | 사건 전개가 빠른 책 | "그가 문을 열었을 때 —" |
| `relatable-confession` | 1인칭 고백 | A-3 | 감정선이 중심인 책 | "나는 이 책을 세 번 덮었다." |

## 톤 프리셋 (`tone` 키)

| 키 | 감정 각성 | 근거 | 어울리는 책 |
|---|---|---|---|
| `unsettling` | 고(불안) | A-1 | 부조리·공포·미스터리 |
| `awe` | 고(경외) | A-1 | 고전·대작·SF |
| `deadpan-humor` | 고(놀람) | A-1 | 풍자·비극(뒤집기) |
| `playful` | 중~고 | A-1 | 아동·청소년·코미디 |
| `heartfelt` | 중 — **훅은 주장·질문으로** | A-3 | 가족·성장·상실 (슬픔 서술 금지) |
| `sci-fi-wonder` | 고(경외) | A-1 | SF·미래·기술 |

## 비주얼 프리셋 (`visual_style` 키)

`style_lock`에 그대로 쓰는 영문 구절이다. 패널·H3 프롬프트 전량에 반복된다.

| 키 | style_lock | 근거·메모 |
|---|---|---|
| `ink-line-art` | `monochrome ink line art, thin clean strokes, flat white background, minimal hatching for shadow, no color` | 콘티 레퍼런스와 동일 룩. 생성 안정성 최고 |
| `flat-cartoon` | `flat 2D cartoon illustration, bold outlines, limited four-color palette, simple geometric shapes, solid backgrounds` | B-3 완주율. 유머 톤 |
| `watercolor-storybook` | `soft watercolor storybook illustration, paper texture, muted warm palette, gentle edges` | heartfelt·아동 |
| `cinematic-realism` | `photorealistic cinematic still, shallow depth of field, natural light, 35mm film grain, muted color grade` | awe·클래식. 인물 일관성 어려움 → character_sheet 필수 |
| `neon-scifi` | `neon-lit science fiction concept art, high contrast, cyan and magenta rim light, volumetric haze` | sci-fi-wonder |
| `paper-cutout` | `layered paper cutout diorama, visible paper edges, soft drop shadows, pastel palette` | playful |

## 컨셉 제시 포맷 (SKILL.md 3단계)

```
A · curiosity-gap × unsettling × ink-line-art
훅: "아침에 눈을 떴는데, 몸이 내 것이 아니었다."
근거: [A-2] 정보격차 — '무엇으로 변했는지'가 구체적이고 3초 뒤 메워짐 · [B-1] 첫 3초 결정 71%
등급: A + B
왜 이 책: 원작 첫 문장이 이미 시각적 이상 — 각색 손실 없음
```

## 15초 구조

| 구간 | 역할 | 근거 |
|---|---|---|
| 0.0–3.0 | 훅. 정보격차를 **구체적으로** 연다 | A-2, B-1, B-2 |
| 3.0–10.5 | 전개. 요약하지 말고 **한 장면**을 보인다 | A-3 |
| 10.5–15.0 | 전환 + 제목 카드. 답을 다 주지 않는다 | A-4 |

## 대본 규칙

- 총 **75음절 이하** (5.5음절/초 × 15초 = 82, 호흡 여유). 검증 V2
- 큐 하나 = 자막 하나 = **최대 2줄 × 12자**. 검증 V3
- 숫자·영문은 한글로 풀어 쓴다 ("1984" → "천구백팔십사년")
- 책 제목은 마지막 큐에서 말하고, 제목 카드로도 띄운다
```

- [ ] **Step 3: conti-panel-spec.md**

```markdown
# 콘티 패널 — 프롬프트 조립과 생성

## 왜 조립인가

패널 룩을 유지하는 기법은 결국 하나다: **같은 구절을 모든 프롬프트에 그대로 반복**.
스타일 락, 캐릭터 시트가 그것이다. 사람이 반복하면 반드시 틀어지므로
`scripts/lib/render-panels.mjs`가 조립한다. 모델은 `storyboard.json`에 다음만 쓴다:

- `style_lock` (1회) — `hook-playbook.md` 비주얼 프리셋 구절
- `character_sheet` (1회, 없으면 `""`) — 얼굴·체형·복장을 구체적으로
- `panels[]` — `shot_type` + `action`(동작 **1개**, 강한 동사) + 한글 VIDEO/AUDIO 노트

조립 결과:

```
{Shot type} of {action}. Character: {character_sheet}. {style_lock}.
Vertical 9:16 portrait composition, single storyboard panel.
No text, no lettering, no captions, no watermark, no panel border.
```

기법 출처: MyUP(스타일 락) · Daring Creatives(캐릭터 시트) · Aiarty(샷 타입 선두, `--no text`) ·
DrawStory(패널당 동작 1개).

## 패널 수와 단위

- **4~6장** (검증 V7). 샷(2~3)마다 키프레임 1장 + 훅 구간은 시작/변화 2장
- 상한 6인 이유: H3 레퍼런스가 9장이라 전량 재투입 가능
- 패널 01은 H3 first-frame으로도 쓸 수 있다

## 생성 — Codex 내장 image_gen

`node scripts/build-storyboard.mjs <dir> --panels`

- `codex exec` **1회**로 전 패널 생성. 지시문은 `<dir>/panel-instruction.txt`에 쓰고
  codex가 읽게 한다 (셸 인용 문제 회피)
- 결과는 `~/.codex/generated_images/<uuid>/ig_*.png` → codex가 `panels/panel-NN.png`로 복사
- 이미 있는 패널은 건너뛴다. 다시 만들려면 `--force-panels`
- 누락되면 시트는 플레이스홀더(프롬프트 카드)로 채우고 exit 0 + 경고
- 소요: 패널당 1~2분. 사용자에게 미리 알린다

### codex 호출 인자 (`CODEX_ARGS`)

```
codex exec -c service_tier=fast -c model=gpt-5.5 --skip-git-repo-check "<프롬프트>"
```

두 오버라이드가 없으면 실패한다 (2026-09-03 실측):

1. `service_tier = "priority"` (앱이 쓴 config) → CLI 0.128.0 파싱 실패. 이때
   `codex-companion.mjs setup --json`은 `auth.loggedIn: false`로 **잘못** 보고한다 — 인증 문제 아님
2. `model = "gpt-5.6-sol"` → 서버 400 "requires a newer version of Codex"

Codex 데스크톱 앱이 켜져 있으면 `~/.codex/config.toml`을 고쳐도 즉시 덮어쓴다. 파일을
고치지 말고 오버라이드로 우회한다. 로그의 `failed to refresh available models: unknown
variant 'max'`와 MCP 인증 실패는 무해하다.

근본 해결(전역 변경이라 사용자 확인 후): `npm i -g @openai/codex`.

### 세로 비율

지정하지 않으면 1536×1024 가로로 나온다. 지시문에 "VERTICAL PORTRAIT (9:16)"를 넣는다.
가로로 나오면 `--force-panels`로 재생성.

## 다른 백엔드로 뽑을 때

`panel-prompts.txt`에 패널별 프롬프트가 있다. ChatGPT·Midjourney·Higgsfield 등에
붙여넣고 결과를 `panels/panel-NN.png`로 저장한 뒤 `--panels` 없이 다시 빌드하면 시트가
채워진다. Midjourney는 끝에 `--ar 9:16 --no text` 추가.
```

- [ ] **Step 4: ttokttok-delivery.md**

```markdown
# 똑똑 피드 납품 규격

## 영상

- 9:16, **1440×2560** 권장 (H3 1440p). 15초. mp4 (H.264 + AAC)
- 관리자 → 게시물 → 영상 게시물 → mp4 업로드 → Supabase Storage. 피드에서 음소거 자동재생·루프
- 소리는 음소거 버튼을 눌러야 들린다 → **자막 없으면 내용 전달 실패**. 자막은 필수

## 세이프영역 — 실측 근거

`upload-video.tsx`가 `object-cover`. 컨테이너(375×755, BottomNav 56px 제외)는 9:16보다
세로로 길어 **영상이 높이에 맞춰지고 좌우가 잘린다**.

| 기기 | 컨테이너 | 렌더 폭 | 크롭/변 |
|---|---|---|---|
| 375×812 | 375×755 | 424.7 | 5.85% |
| 393×852 | 393×795 | 447.2 | 6.06% |
| 430×932 | 430×875 | 492.2 | 6.3% |

크롬(`src/components/feed/chrome.ts` `CHROME_SAFE_AREA`): 좌우 60px(레일 8+44+8),
하단 96px(바 12+76+8), 상단 20px. 음소거 버튼 상단 14+44=58px.

1440×2560 기준 (최악값 + 여유):

| 항목 | 비율 | 픽셀 |
|---|---|---|
| 자막 좌우 인셋 | 20% (크롭 6 + 크롬 14) | 288 |
| 자막 하단 금지 | 15% | 384 |
| 상단 금지 | 10% | 256 |
| 자막 최대 폭 | 60% | 864 |
| 피사체 세이프 | 중앙 88% | 좌우 86px 밖 금지 |

→ H3 프롬프트에 "central 88%" 지시 (렌더러가 자동 삽입).

## ASS 스타일 (`render-ass.mjs`)

| 스타일 | 폰트 | 크기 | 외곽선 | 정렬 | 마진 L/R/V |
|---|---|---|---|---|---|
| Sub | Malgun Gothic Bold | 72 | 6 검정 | 2 (하단 중앙) | 288 / 288 / 384 |
| Title | Malgun Gothic Bold | 96 | 8 검정 | 5 (정중앙) | 288 / 288 / 0 |

- 줄당 12자, 최대 2줄 (864 ÷ 72)
- 파일은 UTF-8 **BOM** (PowerShell 5.1 호환)
- 폰트: `C:\Windows\Fonts\malgun.ttf` 존재 확인. 못 찾으면 `ass=subtitles.ass:fontsdir=C\:/Windows/Fonts`

## 번인 (`burn.ps1`)

```powershell
.\burn.ps1                      # input.mp4 → output.mp4
.\burn.ps1 -In hailuo.mp4 -Out final.mp4
```

`ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out`
상대 경로를 쓰는 이유: libass 필터 인자의 드라이브 콜론(`C:`) 이스케이프 문제 회피.
ffmpeg 없으면 `winget install Gyan.FFmpeg`.

## 콘티 시트 캡처

`msedge --headless=new --screenshot=… --window-size=1600,<h>`. 높이 = 200 + 패널×380 + 120.
Edge(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) 없으면 Chrome, 둘 다
없으면 HTML만 남기고 경고.

## 제작 절차 (사람)

1. `h3-prompt.txt` → H3에 붙여넣기 (9:16 · 15초 · 1440p). 필요하면 `panels/*.png` 레퍼런스 첨부
2. mp4 다운로드 → `docs/shorts/<slug>/input.mp4`
3. `.\burn.ps1` → `output.mp4`
4. 375px 뷰포트에서 자막이 레일·도서 바에 겹치지 않는지 확인 후 관리자 업로드
```

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/references
git commit -m "docs(skill): H3 문법·훅 플레이북·콘티 패널·똑똑 납품 규격 참조 문서

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: SKILL.md

**REQUIRED SUB-SKILL:** `superpowers:writing-skills` — 스킬 문서 작성 규약을 먼저 읽고 아래 초안을 그 규약에 맞춘다 (frontmatter 형식, description 트리거 문구, 길이).

**Files:**
- Create: `.claude/skills/book-shorts-storyboard/SKILL.md`

**Interfaces:**
- Consumes: Task 10의 참조 문서 4개, Task 9의 CLI
- Produces: Claude Code가 로드하는 스킬 본문. 세션 cwd가 `ttokttok-project/`면 `ttokttok:book-shorts-storyboard`, `ttokttok/`이면 `book-shorts-storyboard`로 노출

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: book-shorts-storyboard
description: 도서 소개 15초 쇼츠(MiniMax H3 생성용) 스토리보드 자동화. 책 정보를 받아 근거(학술·산업 데이터, 등급 표시)가 붙은 컨셉 3안을 제시하고, 선택된 안을 storyboard.json으로 전개한 뒤 스크립트로 H3 프롬프트·콘티 시트·ASS 자막·ffmpeg 번인 스크립트를 생성한다. "쇼츠 스토리보드", "도서 소개 영상", "H3 프롬프트", "콘티 만들어", "영상 게시물 만들자", "15초 영상" 요청에 사용.
---

# 도서 소개 15초 쇼츠 스토리보드

똑똑 피드 영상 게시물용 15초 쇼츠의 **기획 → 프롬프트 → 자막**을 한 번에 만든다.
영상 생성(H3)과 업로드는 사람이 한다.

**원칙: 모델은 `storyboard.json` 하나만 쓴다.** H3 문법·ASS 좌표·패널 프롬프트 반복 구절은
`scripts/build-storyboard.mjs`가 조립한다. 창작(훅·컷·대본·장면 묘사)에만 집중한다.

## 워크플로

### 1. 책 정보 수집
제목·저자·소개(줄거리)·인용구(선택). 대화창의 텍스트가 입력이다 — DB·웹을 뒤지지 않는다.
부족하면 **한 번만** 되묻고, 답이 없으면 있는 정보로 진행한다.

### 2. 훅 재료 추출
`references/hook-playbook.md`를 읽고 책에서 뽑는다: 트로프 · 반전 전제 · 감정 정점 ·
놀라운 사실 · 인용 한 줄 · 첫 장면의 시각적 이상(異常).

### 3. 컨셉 3안 제시
플레이북의 훅 유형·톤·비주얼 키로 3안을 만든다. **규칙 (검증 V5가 기계로 막는다):**

- 모든 안은 근거 ID를 **1개 이상** 인용한다 (`references/evidence.json`). 근거 없는 안은 제시 금지
- 3안의 **주근거(`primary_evidence`)와 훅 유형이 서로 다르다** — 같은 근거로 3개면 1안의 변주다
- C등급만으로 선 안은 `[C]`를 표시한다
- 슬픔은 소재로만 — 훅 문장은 주장·질문으로 (A-1과 북톡 훅의 충돌 해소)

포맷은 플레이북 "컨셉 제시 포맷" 절 그대로. `AskUserQuestion`으로 고르게 한다.

### 4. 사용자 선택

### 5. storyboard.json 작성
`docs/shorts/<slug>/storyboard.json`. 스키마는 `scripts/fixtures/kafka-metamorphosis.json`을
그대로 따른다 (필드·타입·허용값). 쓰기 전에 `references/h3-prompt-spec.md`(샷·카메라 규칙)와
`references/conti-panel-spec.md`(style_lock·character_sheet·패널 규칙)를 읽는다.

핵심 제약 — 스크립트가 검증하지만 처음부터 맞춰 쓴다:

| 규칙 | 값 |
|---|---|
| 길이 | 15초 정수, 샷 2~3개, 빈틈 없이 연속 |
| 구조 | 0–3s 훅(정보격차를 구체적으로) · 3–10.5s 한 장면 · 10.5–15s 전환+제목 카드 |
| 내레이션 | 총 **75음절 이하**. 숫자·영문은 한글로 풀어 쓴다 |
| 큐 | 큐 = 자막. **최대 2줄 × 12자**, 0.8초 이상, 겹침 없음 |
| 카메라 | 샷당 1개. `type` 허용값은 `scripts/lib/camera.mjs` |
| 패널 | 4~6개. `shot_type` 선두 + 동작 1개 |
| 기각안 | `concepts`에 3안 전부 기록 (선택 안 포함) |

### 6. 빌드
```bash
node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/<slug> --no-png
```
검증 실패(exit 1)면 stderr의 `[V?]` 메시지대로 JSON을 고치고 재실행. 통과하면
`h3-prompt.txt` · `subtitles.ass` · `burn.ps1` · `panel-prompts.txt` · `contisheet.html` ·
`storyboard.md` · `build-report.json`이 생긴다.

### 7. 콘티 패널 (사용자에게 "수 분 소요"를 먼저 알린다)
```bash
node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/<slug> --panels
```
Codex 내장 `image_gen`으로 `panels/panel-NN.png`를 만들고 `contisheet.png`를 캡처한다.
누락 패널은 시트에 프롬프트 카드로 남는다 — 그대로 두거나 `--force-panels`로 재시도.
codex가 죽으면 `references/conti-panel-spec.md`의 진단 절을 본다.
가로로 나온 패널이 있으면 `--force-panels`.

### 8. 결과 안내
`storyboard.md`의 "제작 절차"를 요약해 전달한다:
1. `h3-prompt.txt`를 H3에 붙여넣기 (9:16 · 15초 · 1440p, 레퍼런스로 `panels/` 첨부 가능)
2. mp4를 `docs/shorts/<slug>/input.mp4`로 저장
3. `.\burn.ps1` → `output.mp4`
4. 똑똑 관리자에서 영상 게시물로 업로드

## 검증 규칙 요약

| ID | 내용 |
|---|---|
| V1 | 샷 2~3개, start 0, 연속, 마지막 end = duration(4~15 정수) |
| V2 | 내레이션 한글 음절 ≤ 75 (V2w: 숫자·영문 경고) |
| V3 | 큐 ≤ 2줄×12자, ≥ 0.8s, 겹침 없음, 범위 안 (V3w: > 7음절/초 경고) |
| V4 | H3 프롬프트 ≤ 7,000자 |
| V5 | 컨셉 3개, 근거 ID 존재, 주근거·훅 유형 중복 없음, 선택안 존재 (V5w: C등급만) |
| V6 | 카메라 type 허용값, static 외 amplitude·speed |
| V7 | 패널 4~6, shot 참조, style_lock |
| V8 | title_card.at ∈ 마지막 샷, 텍스트 |
| V9 | book.title, slug `[a-z0-9-]+` |

## 참조

- `references/hook-playbook.md` — 훅 유형·톤·비주얼 키, 증거 요약, 컨셉 포맷, 15초 구조
- `references/evidence.json` — 근거 ID 정본 (등급·주장·출처)
- `references/h3-prompt-spec.md` — H3 문법과 렌더러가 자동 삽입하는 규칙
- `references/conti-panel-spec.md` — 패널 조립·codex 호출·진단
- `references/ttokttok-delivery.md` — 세이프영역 실측, ASS 스타일, 납품 절차
- `scripts/fixtures/kafka-metamorphosis.json` — 완전한 예제 (스키마 정본)
```

- [ ] **Step 2: 스킬이 로드되는지 확인**

Run (레포 루트): `ls .claude/skills/book-shorts-storyboard/SKILL.md` 후, 새 Claude Code 세션이 아니어도 `Skill` 툴 목록에 `book-shorts-storyboard`(또는 `ttokttok:book-shorts-storyboard`)가 보이는지 확인. 보이지 않으면 frontmatter의 `name`·`description` 형식을 writing-skills 규약과 대조한다.

- [ ] **Step 3: 커밋**

```bash
git add .claude/skills/book-shorts-storyboard/SKILL.md
git commit -m "feat(skill): book-shorts-storyboard SKILL.md — 8단계 워크플로와 검증 규칙

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: 실측 — 픽스처를 실제 산출물로 (codex 패널 · PNG 캡처)

**Files:**
- Create: `docs/shorts/kafka-metamorphosis/storyboard.json` (픽스처 복사)
- Create (스크립트): `docs/shorts/kafka-metamorphosis/{build-report.json,storyboard.md,h3-prompt.txt,panel-prompts.txt,subtitles.ass,burn.ps1,contisheet.html}` — 커밋
- Create (스크립트, gitignore): `docs/shorts/kafka-metamorphosis/panels/*.png`, `contisheet.png`, `panel-instruction.txt`

**Interfaces:**
- Consumes: Task 9 CLI, Task 6 codex 호출, Task 7 PNG 캡처
- Produces: 스킬 사용 예제. 설계 문서 "리스크"의 두 미검증 항목(세로 패널 비율, Edge 캡처)을 실측으로 닫는다

- [ ] **Step 1: 픽스처 복사 후 텍스트 빌드**

```bash
mkdir -p docs/shorts/kafka-metamorphosis
cp .claude/skills/book-shorts-storyboard/scripts/fixtures/kafka-metamorphosis.json docs/shorts/kafka-metamorphosis/storyboard.json
node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/kafka-metamorphosis --no-png
```
Expected: `검증 통과 · 내레이션 50음절 · 큐 6 · 샷 3 · 패널 5 · 프롬프트 N자`

- [ ] **Step 2: 패널 생성 (codex, 5~10분)**

```bash
node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/kafka-metamorphosis --panels
```
Expected: `생성 5 · 건너뜀 0 · 누락 0`, `contisheet.png` 생성.

- [ ] **Step 3: 패널이 세로인지 확인**

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem docs/shorts/kafka-metamorphosis/panels/*.png | ForEach-Object { $i=[System.Drawing.Image]::FromFile($_.FullName); "$($_.Name) $($i.Width)x$($i.Height)"; $i.Dispose() }
```
Expected: 5장 모두 `Width < Height`. 가로가 있으면 `--force-panels`로 재생성. 그래도 가로면 설계 문서 리스크 표대로 "가로 생성 후 중앙 크롭"을 `codex-panels.mjs`에 추가하는 후속 태스크를 만든다 (이 계획 밖).

- [ ] **Step 4: 시트 PNG를 열어 검토**

`Read` 툴로 `docs/shorts/kafka-metamorphosis/contisheet.png`를 보고 확인: 헤더·5행·VIDEO/AUDIO 노트 한글 렌더·패널 이미지 삽입·푸터 근거. 잘림이 있으면 `sheetHeight` 상수(380/행) 조정.

- [ ] **Step 5: 텍스트 산출물 커밋 (PNG는 gitignore)**

```bash
git status --short docs/shorts   # panels/, *.png, panel-instruction.txt 가 안 보여야 함
git add docs/shorts/kafka-metamorphosis
git commit -m "docs(shorts): 카프카 변신 15초 쇼츠 스토리보드 예제 산출물

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 설계 문서 리스크 표 갱신**

`docs/superpowers/specs/2026-09-03-book-shorts-storyboard-design.md` "리스크·미결" 표에서
"내장 image_gen 세로 비율"과 관련 행의 상태를 실측 결과로 바꾼다 (예: `실측 5/5 세로 OK` 또는
`가로 N장 → 후속`). 커밋:

```bash
git add docs/superpowers/specs/2026-09-03-book-shorts-storyboard-design.md
git commit -m "docs(spec): 쇼츠 스토리보드 — 패널 세로 비율·PNG 캡처 실측 결과 반영

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 자체 점검 (작성 후)

- **스펙 커버리지**: 확정 사항 7항목 → Task 3(입력 스키마·3안), 4(H3), 5(음성=H3·자막=ASS/ffmpeg), 6·7(콘티 codex·HTML), 9(구조 B), 11(워크플로). 검증 V1~V9 → Task 3. 세이프영역 수치 → Task 5(ASS 마진)·Task 4(88%)·Task 10(문서). 에러 처리(파싱 2·검증 1·패널/PNG 경고) → Task 9. 비목표는 어느 태스크도 건드리지 않는다.
- **플레이스홀더**: 없음. 모든 코드·문서 본문 포함.
- **타입 일관성**: `validateStoryboard(sb, evidence, { renderPrompt })` (T3) ↔ T9 호출 일치. `generatePanels(dir, sb, { force, timeoutMs, runner })` (T6) ↔ T9. `renderContiSheet(sb, template, { panelExists, evidence })` (T7) ↔ T9. `captureSheetPng(html, png, height, opts)` · `sheetHeight(n)` (T7) ↔ T9. `renderStoryboardMd(sb, report, evidence)` (T8) ↔ T9. `panelFileName` (T6) ↔ T7. `cuesForShot` (T4) ↔ T8.
