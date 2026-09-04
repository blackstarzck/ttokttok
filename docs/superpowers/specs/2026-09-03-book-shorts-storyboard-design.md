# 도서 소개 15초 쇼츠 스토리보드 자동화 스킬 — 설계

작성일 2026-09-03 · 상태: 승인됨 (구현 진행)

## 목적

똑똑 피드의 영상 게시물(`posts.type='video'`, mp4 업로드)에 올릴 **도서 소개 15초
쇼츠**를 빠르게 만들기 위한 Claude Code 스킬. 책 정보를 넣으면 근거가 붙은 컨셉
3안을 받고, 하나를 고르면 **스토리보드 문서 · 콘티 시트 · MiniMax H3 프롬프트 ·
자막(ASS) · 번인 스크립트**가 한 번에 나온다. 영상 생성(H3)과 게시물 업로드는
사람이 한다.

조건 (사용자 요구):

- 15초 안에 줄거리 설명이 끝나야 한다
- 음성 내레이션과 자막이 **둘 다** 들어가야 한다
- 흥미를 유발해야 하며, 그 근거가 **객관적 자료**로 제시돼야 한다

## 확정 사항 (사용자 답변)

| 질문 | 답 |
|---|---|
| 스킬 범위 | **스토리보드 + H3 프롬프트 + 콘티 시트**까지. 영상 생성·업로드는 사람 |
| 음성·자막 | **음성 = H3 네이티브 한국어 TTS, 자막 = 후처리 번인(ASS + ffmpeg)** |
| 입력 | **책 정보 텍스트 붙여넣기** (제목·저자·소개·인용구). DB·네트워크 의존 없음 |
| 진행 | **컨셉 3안 제시 → 선택 → 전개**. 각 안에 근거 ID·등급·출처 필수 |
| 자막 도구 | **ffmpeg 자동화** — 스킬이 ASS와 실행 스크립트를 낸다 |
| 구조 | **SKILL.md + references/ + 검증·생성 스크립트 1개** |
| 콘티 이미지 | **Codex 내장 `image_gen`** (API 키 불필요). 시트는 HTML로 조판 |

## 조사 근거

### MiniMax H3 (Hailuo 3.0) — 스토리보드 구조를 결정하는 스펙

| 항목 | 값 | 설계 영향 |
|---|---|---|
| 길이 | 4~15초 정수, **단일 생성** | 15초 쇼츠가 1회 생성으로 끝남. 클립 이어붙이기 없음 |
| 멀티샷 | 네이티브 멀티샷 | 15초에 **2~3컷**이 통제 가능한 상한 (RunDiffusion 가이드) |
| 오디오 | 네이티브 스테레오: 대사 립싱크 + SFX + 룸톤, TTS 11개 언어에 **한국어 포함** | 내레이션을 H3가 직접 낸다 |
| 화면 텍스트 | 2K에서 판독 가능 수준 | **한글 자막 정확도는 미검증** → 자막은 H3에 맡기지 않는다 |
| 비율 | 9:16 지원, 1440p | 똑똑 피드에 그대로 |
| 레퍼런스 | 이미지 9 / 영상 3 / 오디오 3 | 콘티 패널을 레퍼런스로 재투입 가능 |
| 프롬프트 | 7,000자 한도, 3필드 스키마 | 아래 |

공식 프롬프트 문법 (`references/h3-prompt-spec.md`에 정본 보관):

- 필드: `integrated_multimodal_description` / `overall_soundscape` / `non_diegetic_music`
- 샷: `[Shot 1]`, 이후 샷은 `At 00:03.500, the camera cuts to …` (타임코드 단조 증가)
- 카메라: type + amplitude + speed를 자연어로, **샷당 1개 움직임만**
- 화자 `(S1)`, 대사 `<d>[Korean] …</d>` — 원문 언어 그대로 보존
- 보이스오버: "says in an off-screen voiceover" + "lips remain completely closed"
- 화면 텍스트는 큰따옴표 축자 — 우리는 **금지 지시**를 넣는다 (자막은 번인)

출처: [MiniMax 공식](https://www.minimax.io/blog/minimax-h3) · [Morphic 스펙](https://morphic.com/resources/models/minimax-h3) · [프롬프트 포맷](https://minimax-h3-ai.com/blog/minimax-h3-prompt-guide/) · [RunDiffusion 스토리보드 가이드](https://www.rundiffusion.com/minimax-h3-prompt-guide)

### 흥미 유발 증거 베이스 — 등급 구분

학술 근거와 마케팅 블로그 주장을 같은 무게로 쓰지 않는다. 컨셉 제시 때 등급을
함께 표시한다. 기계 판독용 정본은 `references/evidence.json`, 해설은
`references/hook-playbook.md`.

**A등급 — 동료심사 학술**

| ID | 주장 | 출처 |
|---|---|---|
| A-1 | 고각성 감정(경외·분노·불안)이 저각성(슬픔)보다 확산 우위. NYT 3개월 전수 + 인과 실험 | Berger & Milkman 2012, *J. Marketing Research* 49(2) |
| A-2 | 호기심은 정보격차에서 발생. 최대 조건 3: ①빠진 걸 알아챌 만큼 알아야 ②빠진 정보가 구체적 ③메울 수 있다고 느껴야 | Loewenstein 1994, *Psychological Bulletin* 116(1) |
| A-3 | 서사 몰입(transportation)이 반론을 억제하고 태도를 바꿈 (N=97, N=69) | Green & Brock 2000, *JPSP* 79(5) |
| A-4 | 미완결 과제가 기억에 남음 (자이가르닉) — 클리프행어 근거 | Zeigarnik 1927 |

**B등급 — 대규모 산업 데이터** (1차 출처 미확인, 업계 리포트 재인용)

| ID | 주장 |
|---|---|
| B-1 | 71%가 첫 3초에 계속 볼지 결정 |
| B-2 | 3초 유지율 85%↑ → 총 조회수 2.8배, 70~85% → 2.2배. 알고리즘 최소 임계 65~70% |
| B-3 | 애니메이션 완주율 70~85% vs 실사 50~65%; 3D 애니 몰입 +30% (Millward Brown) |

**C등급 — 업계 주장** (수치 검증 불가)

| ID | 주장 |
|---|---|
| C-1 | 북톡에서 트로프 명시가 일반 설명 대비 인게이지먼트 3배 |
| C-2 | 최적 길이 20~30초, 15초 미만은 훅 깊이 부족 |

**증거 충돌과 해소**: 북톡 대표 훅 "이 책 읽고 3일 밤을 울었다"는 슬픔인데 A-1은
슬픔의 확산력이 낮다고 한다. 그 훅이 작동하는 이유는 슬픔이 아니라 **대담한 주장 +
정보격차(A-2)**이고, 예고 시점의 감정은 기대·불안(고각성)이다. → 규칙: *슬픔을
소재로 쓰되 훅은 슬픔을 서술하지 말고 주장·질문으로 낼 것.*

**C-2와의 충돌**: 15초는 일반 권장(20~30초)보다 짧다. 15초 제약은 유지하되 그래서
**줄거리 요약이 아니라 훅 하나만 파는 구조**여야 한다.

### 콘티 패널 프롬프트 기법

| 기법 | 내용 |
|---|---|
| 스타일 락 | 동일 스타일 문구를 모든 패널에 그대로 반복 |
| 캐릭터 시트 | 인물 외형을 한 번 확정하고 모든 프롬프트에 복붙 |
| 샷 타입 선두 | 문장 맨 앞에 샷 타입 |
| 패널당 동작 1개 | 강한 동사 하나 |
| 텍스트 금지 | `no text` — 한글은 시트(HTML)가 담당 |
| 1프레임 선테스트 | 한 장으로 룩 확정 후 배치 |

"모든 프롬프트에 똑같이 반복"을 사람이 하면 반드시 틀어진다 → **스크립트가 조립**한다.

### 똑똑 피드 세이프영역 — 실측

`upload-video.tsx`는 `object-cover`. 컨테이너(375×755, BottomNav 56px 제외)는 9:16보다
세로로 길어 영상이 **높이 기준으로 맞춰지고 좌우가 잘린다**. 렌더 폭 424.7px, 크롭
각 24.85px = **폭의 5.85%**. 430×932 기기에서는 6.3%.

크롬(`chrome.ts` `CHROME_SAFE_AREA`): 좌우 60px, 하단 96px, 상단 20px. 음소거 버튼
상단 58px.

1440×2560 영상 기준 (기기별 최악값, 여유 포함):

| 항목 | 값 | 픽셀 |
|---|---|---|
| 좌우 크롭 | 각 ~6% | — |
| 자막 좌우 인셋 | 각 **20%** (크롭 6 + 크롬 14) | 288 |
| 자막 하단 금지 | **15%** | 384 |
| 상단 금지 | **10%** | 256 |
| 자막 최대 폭 | 60% | 864 |

→ H3 프롬프트에 **"중요 피사체·얼굴은 중앙 88% 안에"** 지시가 반드시 들어간다.

### Codex 이미지 생성 경로 — 실측 (2026-09-03)

- `~/.codex/skills/.system/imagegen/` 시스템 스킬. **내장 `image_gen` 툴은 API 키
  불필요**. 결과는 `~/.codex/generated_images/<uuid>/ig_*.png`
- CLI 0.128.0은 앱 config(`service_tier=priority`, `model=gpt-5.6-sol`)를 감당 못 한다.
  **작동 확인된 호출**: `codex exec -c service_tier=fast -c model=gpt-5.5 --skip-git-repo-check "…"`
- 선화 패널 1장 정상 생성 확인. 방향을 지정하지 않으면 1536×1024 가로 → **세로 명시 필수**
- 로그의 `failed to refresh available models: unknown variant 'max'`와 MCP 인증 실패는 무해

## 아키텍처

### 위치와 파일 구조

`ttokttok/.claude/skills/book-shorts-storyboard/` — 레포에 버전 관리. 세션 cwd가
상위 `ttokttok-project/`면 `ttokttok:book-shorts-storyboard`로 노출된다.

```
book-shorts-storyboard/
├── SKILL.md                     # 워크플로. 짧게 유지
├── references/
│   ├── h3-prompt-spec.md        # H3 문법 정본 + 조립 규칙 해설
│   ├── hook-playbook.md         # 훅 유형 8종 · 톤/비주얼 프리셋 6종 · 증거 해설
│   ├── evidence.json            # 증거 ID 레지스트리 (스크립트가 읽음)
│   ├── conti-panel-spec.md      # 패널 프롬프트 조립 규칙 · codex 호출법
│   └── ttokttok-delivery.md     # 세이프영역 수치 · ASS 스타일 · 제작 절차
├── templates/
│   └── contisheet.html          # VIDEO │ 패널 │ AUDIO 스프레드 템플릿
└── scripts/
    ├── build-storyboard.mjs     # 검증 + 전 산출물 생성 (+ --panels로 codex 호출)
    ├── lib/                     # 순수 함수 모듈 (테스트 대상)
    └── *.test.mjs               # node --test
```

### 책임 분담 원칙

**모델은 `storyboard.json` 하나만 쓴다.** 나머지 전부를 스크립트가 결정론적으로
파생한다. 이유: H3 문법·ASS 좌표·ffmpeg 인자·패널 프롬프트의 반복 구절은 사람이(모델이)
매번 손으로 쓰면 조용히 틀어진다. 창작(훅·컷·대본·장면 묘사)은 모델, 문법·좌표·조립·
검증은 기계.

### 데이터 흐름

```
책 정보(텍스트) ─▶ 모델: 훅 재료 추출 ─▶ 컨셉 3안 (+근거 ID) ─▶ 사용자 선택
                                                                    │
                                              모델: storyboard.json ◀┘
                                                        │
                    node scripts/build-storyboard.mjs <dir> [--panels]
                                                        │
        ┌──────────┬──────────────┬────────────┬────────┼─────────┬────────────┐
   검증 리포트  h3-prompt.txt  panel-prompts.txt  subtitles.ass  burn.ps1  storyboard.md
                                      │
                       (--panels) codex exec ─▶ panels/panel-NN.png
                                      │
                        contisheet.html ─▶ (Edge headless) contisheet.png
```

## 워크플로 (SKILL.md)

| 단계 | 내용 |
|---|---|
| 1 | 책 정보 수집 — 제목·저자·소개·인용구(선택). 부족하면 **1회만** 되묻고 진행 |
| 2 | 훅 재료 추출 — 트로프, 반전 전제, 감정 정점, 놀라운 사실, 인용 한 줄 |
| 3 | **컨셉 3안 제시**. 각 안: 훅 유형 · 톤 · 비주얼 · 훅 문장 · 근거(ID+등급+출처) · 왜 이 책인가. 규칙 ①근거 ID ≥1 ②3안의 주근거·훅 유형 서로 다름 ③C등급만이면 `[C]` 표시 |
| 4 | 사용자 선택 (AskUserQuestion) |
| 5 | 15초 타임라인 전개 → `docs/shorts/<slug>/storyboard.json` 작성 |
| 6 | `node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/<slug>` — 검증 실패 시 JSON 수정 후 재실행 |
| 7 | 검증 통과 후 `--panels`로 콘티 패널 생성 (codex, 수 분 소요 — 사용자에게 예고) |
| 8 | 결과 안내: 파일 목록, 제작 절차(H3 붙여넣기 → mp4 다운로드 → `input.mp4` → `burn.ps1`) |

**15초 타임라인 규칙**

| 구간 | 역할 | 근거 |
|---|---|---|
| 0.0–3.0s | 훅. 정보격차를 **구체적으로** 연다 | A-2, B-1, B-2 |
| 3.0–10.5s | 전개. 요약하지 말고 **한 장면**으로 보인다 | A-3 |
| 10.5–15.0s | 전환 + 책 제목 카드 (자막 번인) | A-4 |

기본 15초, 컷 2~3개. 구간 경계는 권장값이며 검증은 연속성·총합만 본다.

## `storyboard.json` 스키마

```jsonc
{
  "version": 1,
  "book": { "title": "변신", "author": "프란츠 카프카", "slug": "kafka-metamorphosis" },
  "duration_sec": 15,                          // 4~15 정수
  "concepts": [                                 // 정확히 3개. 기각안도 기록한다
    {
      "id": "A",
      "hook_type": "curiosity-gap",             // hook-playbook.md의 훅 유형 키
      "tone": "unsettling",                     // 톤 프리셋 키
      "visual_style": "ink-line-art",           // 비주얼 프리셋 키
      "hook_line_ko": "출근길 지하철. 그런데 아무도 그를 못 본다.",
      "evidence": ["A-2", "B-1"],               // evidence.json의 ID
      "primary_evidence": "A-2",                // 3안 간 중복 금지
      "why_this_book_ko": "원작 1장이 이미 시각적 이상으로 시작 — 각색 손실 없음"
    }
  ],
  "selected_concept": "A",
  "style_lock": "monochrome ink line art, thin clean strokes, flat white background, minimal shading",
  "character_sheet": "a man in his 30s, short dark hair, gaunt face, grey suit, thin frame",  // 없으면 ""
  "shots": [
    {
      "n": 1,
      "start": 0.0, "end": 3.0,
      "description": "…(영문, 장면 묘사)",
      "camera": { "type": "push", "amplitude": "small", "speed": "slow", "target": "his face" },
      "sfx": "distant subway rumble"           // 선택
    }
  ],
  "narration": [                                // 큐 = 자막 큐 (1:1 동기)
    { "start": 0.4, "end": 2.8, "text_ko": "아침에 눈을 떴는데" }
  ],
  "overall_soundscape": "…(영문 1~4문장)",
  "non_diegetic_music": "…(영문 1~3문장, 악기·템포·다이내믹)",
  "panels": [                                   // 4~6개
    {
      "id": "01", "shot": 1,
      "shot_type": "medium close-up",
      "action": "a man lying in bed staring at the ceiling, one hand raised",
      "video_note_ko": "침대에 누운 그레고르, 천장을 본다",
      "audio_note_ko": "NA) 아침에 눈을 떴는데 / S.E) 멀리 지하철 소리"
    }
  ],
  "title_card": { "text_ko": "변신 · 프란츠 카프카", "at": 12.5 }
}
```

카메라 `type` 허용값: `static | push | pull | zoom_in | zoom_out | pan_left | pan_right |
truck_left | truck_right | tilt_up | tilt_down | pedestal_up | pedestal_down | arc |
tracking | shake | pov | roll`. `static`은 amplitude/speed 생략. 그 외는
amplitude ∈ `small|medium|large`, speed ∈ `slow|medium|fast` 필수.

## 산출물 스펙

출력 디렉터리: `ttokttok/docs/shorts/<slug>/`

| 파일 | 작성자 | 용도 |
|---|---|---|
| `storyboard.json` | **모델** | 유일한 원본 |
| `build-report.json` | 스크립트 | 검증 결과 (errors/warnings/metrics) |
| `storyboard.md` | 스크립트 | 사람용 기획서 |
| `h3-prompt.txt` | 스크립트 | H3에 붙여넣기 |
| `panel-prompts.txt` | 스크립트 | 패널 프롬프트 (백엔드 무관 이식) |
| `panels/panel-NN.png` | codex | 콘티 그림 · H3 레퍼런스 겸용 |
| `contisheet.html` / `.png` | 스크립트 | 콘티 시트 |
| `subtitles.ass` | 스크립트 | 자막 |
| `burn.ps1` | 스크립트 | ffmpeg 번인 |

### `h3-prompt.txt` 조립

```
integrated_multimodal_description:
{style_lock}. Vertical 9:16 portrait video, {duration} seconds, {N} shots.
Keep every key subject and face inside the central 88% of the frame width —
the outer 6% on each side is cropped by the player. Do not render any on-screen
text, captions, subtitles, titles, or lettering anywhere in the video.
[character_sheet가 있으면] Recurring on-screen character: {character_sheet}.
Preserve these features in every shot. (S1) is the narrator and never appears on screen.

[Shot 1] {description}. The camera {camera phrase}. {sfx}.
(S1) says in an off-screen voiceover while every on-screen character's lips remain
completely closed: <d>[Korean] {이 샷 구간의 내레이션 큐를 공백으로 결합}</d>
[Shot 2] At 00:03.000, the camera cuts to {description}. …

overall_soundscape:
{overall_soundscape}

non_diegetic_music:
{non_diegetic_music}
```

- 내레이션 큐는 `cue.start ∈ [shot.start, shot.end)`인 샷에 귀속. 큐가 없는 샷은
  보이스오버 문장 생략
- 카메라 문구: `The camera {verb} with {amplitude} amplitude at {speed} speed[ toward {target}]`.
  `static` → `The camera holds completely static`
- 타임코드 `MM:SS.mmm`

### `panel-prompts.txt` 조립과 codex 호출

패널 프롬프트:

```
{shot_type} of {action}. [Character: {character_sheet}. ]{style_lock}.
Vertical 9:16 portrait composition, single storyboard panel.
No text, no lettering, no captions, no watermark, no panel border.
```

`--panels` 실행 시 **codex exec 1회**로 전 패널을 생성한다 (패널마다 세션을 띄우면
4~6분 낭비). cwd = 출력 디렉터리. 지시문(영문): imagegen 스킬의 내장 `image_gen`으로
각 패널을 세로로 생성하고 `$CODEX_HOME/generated_images`에서 `panels/panel-NN.png`
상대 경로로 복사, 다른 파일은 건드리지 말 것. 스크립트는 종료 후 각 PNG 존재를
확인하고 누락을 보고한다. 이미 있는 패널은 건너뛴다(`--force-panels`로 재생성).
codex 인자는 스크립트 상단 `CODEX_ARGS` 상수 한 곳에만 둔다.

### `subtitles.ass`

```
[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 2560
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1
Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.40,0:00:02.80,Sub,,0,0,0,,아침에 눈을 떴는데
Dialogue: 0,0:00:12.50,0:00:15.00,Title,,0,0,0,,변신 · 프란츠 카프카
```

- 큐 텍스트는 12자 이내 마지막 공백에서 줄바꿈(`\N`), 최대 2줄
- 타임코드 `H:MM:SS.cc`
- 제목 카드는 `Title` 스타일, 중앙(Alignment 5), `title_card.at`부터 끝까지
- 폰트: `Malgun Gothic` (Windows 기본). `C:\Windows\Fonts\malgun.ttf` 존재 확인됨

### `burn.ps1`

```powershell
param([string]$In = "input.mp4", [string]$Out = "output.mp4")
Set-Location $PSScriptRoot           # 상대 경로로 ass 필터의 드라이브 콜론 문제 회피
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Error "ffmpeg 없음: winget install Gyan.FFmpeg"; exit 1 }
if (-not (Test-Path $In)) { Write-Error "$In 없음 — H3에서 받은 mp4를 이 이름으로 두세요"; exit 1 }
ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
```

### `contisheet.html` → `contisheet.png`

- 헤더: 책 제목·저자 · 선택 컨셉(훅 유형·톤) · 총 길이
- 행 = 패널: 좌 **VIDEO**(샷 번호·타임코드·`video_note_ko`) │ 중 **9:16 패널 이미지**
  (없으면 프롬프트 카드 플레이스홀더) │ 우 **AUDIO**(`audio_note_ko`)
- 푸터: 근거 요약(ID·등급)
- 폭 1600px, 시스템 한국어 폰트, 인쇄 CSS
- PNG: `msedge --headless=new --disable-gpu --screenshot=<abs> --window-size=1600,<h> file:///<abs html>`.
  높이 = 200 + 패널수×380 + 120. Edge 없으면 Chrome, 둘 다 없으면 경고 후 HTML만

### `storyboard.md`

스크립트가 JSON에서 렌더한다. 절: 컨셉(선택안 + 근거 표) · 기각 2안(한 줄씩) ·
타임라인 표(샷·구간·화면·카메라·내레이션·SFX) · 자막 큐 표 · 콘티 시트 링크 ·
제작 절차 · 검증 요약(`build-report.json` 발췌).

## 검증 규칙 (`build-storyboard.mjs`)

에러는 빌드를 중단시킨다(exit 1). 경고는 리포트에만 남는다.

| ID | 규칙 | 수준 |
|---|---|---|
| V1 | 샷 2~3개, `shots[0].start=0`, 연속(`end[i]=start[i+1]`), 마지막 `end=duration`, duration 4~15 정수 | 에러 |
| V2 | 내레이션 총 **한글 음절 ≤ 75** (5.5음절/초×15초=82, 호흡 여유 7 차감). 한글 완성형(U+AC00–D7A3)만 센다 | 에러 |
| V2w | 대본에 아라비아 숫자·영문 포함 (TTS 낭독 불안정, 음절 계산 누락) | 경고 |
| V3 | 큐: 줄바꿈 후 ≤2줄·줄당 ≤12자, 표시 ≥0.8초, 겹침 없음, `[0,duration]` 안 | 에러 |
| V3w | 큐 발화 속도 > 7음절/초 | 경고 |
| V4 | `h3-prompt.txt` ≤ 7,000자 | 에러 |
| V5 | 컨셉 정확히 3개, 각 `evidence` ≥1이며 `evidence.json`에 존재, `primary_evidence ∈ evidence`, 3안의 `primary_evidence`·`hook_type` 서로 다름, `selected_concept` 존재 | 에러 |
| V5w | 선택 컨셉의 근거가 C등급만 | 경고 |
| V6 | 샷마다 카메라 1개, `type` 허용값, static 외에는 amplitude·speed 필수 | 에러 |
| V7 | 패널 4~6개, `shot` 참조 유효, `style_lock` 비어있지 않음 | 에러 |
| V8 | `title_card.at`이 마지막 샷 구간 안, 텍스트 비어있지 않음 | 에러 |
| V9 | `book.title`·`slug` 존재, slug `/^[a-z0-9-]+$/` | 에러 |

리포트(`build-report.json`): `{ ok, errors[], warnings[], metrics: { syllables, cues, shots, promptChars } }`
+ 콘솔 요약. 사람이 읽는 규칙 해설은 SKILL.md에 표로 둔다.

## 에러 처리

- JSON 파싱 실패 → 위치와 함께 중단
- 검증 에러 → 산출물 생성 없이 리포트만 쓰고 exit 1 (반쪽 산출물을 남기지 않는다)
- codex 미설치/실패 → 누락 패널 목록을 보고하고 시트는 플레이스홀더로 완성. exit 0 + 경고
  (패널은 선택 산출물)
- Edge/Chrome 없음 → `contisheet.png` 생략, HTML만. 경고
- ffmpeg는 빌드 시 검사하지 않는다 — `burn.ps1`이 실행 시 검사·안내

## 테스트

`node --test` (Node 24 내장, 의존성 0). 순수 함수는 `scripts/lib/`로 분리해 단위 테스트.

- 음절 카운트: 한글만, 공백·문장부호·숫자 제외
- 줄바꿈: 12자 경계, 공백 우선, 공백 없으면 강제 분할
- 타임코드 포맷: H3 `MM:SS.mmm`, ASS `H:MM:SS.cc`
- 카메라 문구: 18개 type 전부 + static 특례
- 검증기: V1~V9 각각 통과/실패 픽스처
- H3 렌더: 샷 라벨·타임코드·`<d>[Korean]…</d>`·88% 지시·텍스트 금지 지시 포함, 큐 귀속
- ASS 렌더: 스타일 2개, 마진 288/384, `\N`, 제목 카드
- 패널 프롬프트: 모든 패널에 `style_lock`·`character_sheet` 포함, 세로·no text 포함
- e2e: 픽스처 JSON → 전 산출물 파일 존재(`--panels` 제외)
- codex 호출은 자동 테스트하지 않는다 (외부·유료). 구현 중 1회 실측

픽스처: 카프카 「변신」 — 퍼블릭 도메인이고 똑똑의 위키문헌 수급 방침과 맞는다.

## 비목표

- H3 API 직접 호출 · Supabase Storage 업로드 · `posts`/`post_videos` 레코드 생성
- 자막 애니메이션·강조 효과 (ASS 단순 스타일만)
- EPUB 본문 파싱, 웹 검색 기반 줄거리 수집
- 다국어 (한국어 단일)
- 콘티 시트의 손보기 UI

## 리스크·미결

| 항목 | 상태 | 대응 |
|---|---|---|
| H3 한국어 TTS 품질 | 미검증 (공식 지원만 확인) | 첫 생성 결과로 판단. 부적합하면 `narration`을 별도 TTS로 돌리는 경로는 이 스킬 범위 밖 |
| 내장 `image_gen` 세로 비율 | **실측 완료 (2026-09-04)** — 지시문 "VERTICAL PORTRAIT (9:16)"로 5/5 장 941×1672(정확히 9:16) 생성. codex exec 1회, 약 4분 | 닫힘. 가로가 나오면 `--force-panels` |
| 콘티 시트 캡처 높이 | **실측 보정** — 380/행·푸터 120은 두 번째 근거 줄을 잘랐다. 행 402(패널 356+패딩 44+경계 2)·헤더 140·푸터 220으로 교정, `.sheet { min-height: 100vh }`로 여백 흰색 | 닫힘 |
| codex 우회 플래그 | CLI/앱 업데이트로 바뀔 수 있음 | `CODEX_ARGS` 상수 1곳 + `conti-panel-spec.md`에 진단법 |
| 크롭 6% | 표준 폰 기준. 태블릿·480px 프레임은 덜 잘림 | 보수적 세이프영역 유지 (잘리는 쪽이 치명적) |
| 음절/초 5.5 | 뉴스 낭독 기준 근사 | 첫 영상에서 실측 후 상수 조정 |
