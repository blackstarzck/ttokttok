---
name: book-shorts-storyboard
description: Use when asked for a 15-second book-introduction short for the Ttokttok video feed — 도서 소개 쇼츠, 영상 게시물, 콘티, 스토리보드, MiniMax H3(Hailuo) 프롬프트, 쇼츠 자막 — or when a docs/shorts/*/storyboard.json must be written, fixed, validated, or rebuilt.
---

# 도서 소개 15초 쇼츠 스토리보드

## Overview

똑똑 피드 영상 게시물용 15초 쇼츠의 **기획 → H3 프롬프트 → 콘티 시트 → 자막**을 한 번에 만든다.
영상 생성(MiniMax H3)과 업로드는 사람이 한다.

**모델은 `storyboard.json` 하나만 쓴다.** 문법·좌표·반복 구절은 `scripts/build-storyboard.mjs`가
조립하고 V1~V9로 검증한다. 스크립트가 만든 파일은 손으로 고치지 않는다 — JSON을 고치고 다시 빌드한다.

## When to Use

- "도서 소개 쇼츠/영상 게시물/콘티/스토리보드 만들어", "H3 프롬프트", "15초 영상", "쇼츠 자막"
- `docs/shorts/<slug>/storyboard.json`을 쓰거나 고치거나 빌드할 때
- 아닌 경우: 카드 게시물, 30초 이상 영상, 영상 파일 생성·업로드 자체

## Workflow

1. **책 정보 수집** — 제목·저자·소개·인용구(선택). 대화창 텍스트가 입력. DB·웹은 뒤지지 않는다.
   부족하면 **한 번만** 되묻고, 답이 없으면 있는 정보로 간다.
2. **훅 재료 추출** — `references/hook-playbook.md`를 읽고 뽑는다: 트로프 · 반전 전제 · 감정 정점 ·
   놀라운 사실 · 인용 한 줄 · 첫 장면의 시각적 이상(異常).
3. **컨셉 3안 제시** — 플레이북의 `hook_type`·`tone`·`visual_style` 키와 "컨셉 제시 포맷"으로.
   각 안은 `references/evidence.json`의 근거 ID를 **1개 이상** 인용하고, 3안의 **주근거와 훅 유형은 서로
   다르다**. C등급만이면 `[C]` 표시. 슬픔은 소재로만 — 훅 문장은 주장·질문으로.
   `AskUserQuestion`으로 고르게 한다.
4. **사용자 선택.**
5. **`docs/shorts/<slug>/storyboard.json` 작성** — 스키마·허용값은 `scripts/fixtures/kafka-metamorphosis.json`
   그대로. 기각한 2안도 `concepts`에 넣는다. 쓰기 전에 `references/h3-prompt-spec.md`,
   `references/conti-panel-spec.md`를 읽는다.
6. **빌드** — 검증 실패(exit 1)면 stderr의 `[V?]` 메시지대로 JSON을 고쳐 재실행.
   ```bash
   node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/<slug> --no-png
   ```
7. **콘티 패널** — 사용자에게 **"수 분 소요(패널당 약 1분)"를 먼저 알리고** 실행. Codex 내장
   `image_gen`이 `panels/panel-NN.png`를 만들고 Edge가 `contisheet.png`를 캡처한다.
   누락·가로 패널은 `--force-panels`. codex가 죽으면 `references/conti-panel-spec.md` 진단 절.
   ```bash
   node .claude/skills/book-shorts-storyboard/scripts/build-storyboard.mjs docs/shorts/<slug> --panels
   ```
8. **결과 안내** — `storyboard.md` "제작 절차" 4단계(H3에 `h3-prompt.txt` 붙여넣기 → mp4를 `input.mp4`로
   저장 → `.\burn.ps1` → 관리자 업로드)와 파일 목록을 전달한다.

## Quick Reference — 처음부터 맞춰 쓸 제약

검증기가 잡지만 알고 쓰면 한 번에 통과한다. 상세 메시지는 빌드 stderr.

| 항목 | 값 |
|---|---|
| 길이·샷 | 15초 정수 · 샷 2~3개, 0부터 빈틈 없이 연속 · 0–3s 훅 / 3–10.5s 한 장면 / 10.5–15s 전환+제목 카드 |
| 내레이션 | 합계 **한글 75음절 이하** · 숫자·영문은 한글로 |
| 큐(=자막) | **2줄 × 12자**(공백 포함, 공백 우선 줄바꿈) · 0.8초 이상 · 겹침 없음 · 7음절/초 넘으면 경고 |
| 제목 큐 | 제목을 말하는 마지막 큐에는 **`"no_subtitle": true`** — 안 붙이면 제목 카드와 하단 자막에 같은 글자가 겹친다 |
| 카메라 | 샷당 1개 · `type`은 `scripts/lib/camera.mjs`의 18키 · `static` 외 `amplitude`·`speed` 필수 |
| 컨셉 | 3개 · 근거 ID 존재 · 주근거·훅 유형 중복 없음 |
| 패널 | 4~6개 · `shot_type` 선두 + 동작 1개 · `style_lock` 필수 |
| 제목 카드 | `title_card.at`은 마지막 샷 안 |

## Common Mistakes

| 실수 | 고치는 법 |
|---|---|
| 줄거리를 다 설명하려 함 → 75음절 초과 | 15초는 "무슨 책인지"가 아니라 "왜 열어봐야 하는지"만. 훅 하나만 판다 |
| 훅의 핵심이 **화면 글자**(벽의 문구, 편지)인데 H3는 화면 텍스트 금지 | 의미는 내레이션·자막이 전한다. `description`은 "글자로 읽히지 않는 붓 자국"처럼 형태만 묘사 |
| 정체를 숨기는 훅인데 `character_sheet`에 그 인물을 넣음 | 캐릭터 시트는 **모든** 패널·샷에 반복된다. 숨길 인물은 비우고, 드러나는 샷·패널의 `description`/`action`에만 쓴다 |
| 근거를 감으로 씀 ("재미있을 것") | `evidence.json` ID를 인용. 근거 없는 안은 버린다 |
| 3안이 같은 근거의 변주 | 주근거·훅 유형을 서로 다르게. 플레이북에서 `bold-claim`·`pattern-interrupt`는 둘 다 A-1 — 같이 쓰면 하나는 주근거를 바꿔야 한다 |
| 큐 하나에 문장 두 개 | 큐 = 화면에 한 번 뜨는 자막. 쪼갠다. 줄바꿈이 어색하면 쉼표로 끊는 위치를 유도 |
| `storyboard.md`·`h3-prompt.txt`를 직접 편집 | 파생물. JSON 수정 → 재빌드 |

## References

- `references/hook-playbook.md` — 훅 유형·톤·비주얼 키, 증거 요약과 충돌 해소, 컨셉 제시 포맷, 15초 구조
- `references/evidence.json` — 근거 ID 정본 (등급·주장·출처)
- `references/h3-prompt-spec.md` — H3 문법과 렌더러가 자동 삽입하는 규칙
- `references/conti-panel-spec.md` — 패널 조립·codex 호출·진단
- `references/ttokttok-delivery.md` — 세이프영역 실측, ASS 스타일, 납품 절차
- `scripts/fixtures/kafka-metamorphosis.json` — 완전한 예제 (스키마 정본) · 산출 예: `docs/shorts/kafka-metamorphosis/`
