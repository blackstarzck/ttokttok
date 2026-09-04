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
  (`storyboard.json`의 `camera.type` 허용값은 `scripts/lib/camera.mjs`)

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
- 내레이션 큐는 `cue.start`가 속한 샷에 귀속. 큐 없는 샷은 보이스오버 문장 생략

## 출처

- https://www.minimax.io/blog/minimax-h3
- https://morphic.com/resources/models/minimax-h3
- https://minimax-h3-ai.com/blog/minimax-h3-prompt-guide/
- https://www.rundiffusion.com/minimax-h3-prompt-guide
