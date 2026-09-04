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
- 책 제목은 마지막 큐에서 말하고, 제목 카드로도 띄운다. 이때 그 큐에 **`"no_subtitle": true`**를
  붙인다 — 안 붙이면 같은 글자가 하단 자막과 중앙 제목 카드에 동시에 떠서 겹친다.
  `no_subtitle` 큐는 H3가 읽기만 하고 자막에서 빠지며, 12자·2줄 제한을 면제받는다
  (길이·겹침·발화 속도는 그대로 검사한다)
