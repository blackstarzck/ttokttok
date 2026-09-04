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

## 1프레임 선테스트 — 프리셋을 고쳤다면 필수

`style_lock`을 플레이북 프리셋 그대로 쓰지 않고 한 구절이라도 바꿨다면, **전량 생성 전에
한 장만 뽑아 확인한다.** 실측(2026-09-04): `ink-line-art`에서 `flat white background`를
빼고 `deep black shadows`를 넣었더니 얇은 선화가 아니라 짙은 목탄화가 나왔다. 문구는
여전히 "ink line art, thin clean strokes"라고 말하고 있었다. 5장을 다 뽑은 뒤에야 알았다.

한 장만 뽑는 법: `panels`를 1개만 둔 임시 JSON으로 빌드하거나, `panel-prompts.txt`의 첫
프롬프트를 아무 이미지 도구에 붙여넣어 본다. 룩이 확정되면 나머지를 생성한다.

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
