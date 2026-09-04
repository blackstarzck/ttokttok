# 변신 — 15초 쇼츠 스토리보드

프란츠 카프카 · 생성: book-shorts-storyboard 스킬 · 원본: `storyboard.json` (이 문서는 파생물 — JSON을 고치고 다시 빌드한다)

## 컨셉 A · curiosity-gap × unsettling × ink-line-art

**훅:** 아침에 눈을 떴는데, 몸이 내 것이 아니었다.

**왜 이 책인가:** 원작 첫 문장이 이미 구체적인 정보격차다 — 무엇으로 변했는지 3초간 보여주지 않으면 갭이 열린다. 각색 손실 없음.

| 근거 | 등급 | 주장 | 출처 |
|---|---|---|---|
| A-2 | A | 호기심은 정보격차에서 발생. 최대 조건 3: 빠진 걸 알아챌 만큼 알아야 / 빠진 정보가 구체적이어야 / 메울 수 있다고 느껴야 | [Loewenstein 1994, Psychological Bulletin 116(1), 75–98](https://doi.org/10.1037/0033-2909.116.1.75) |
| B-1 | B | 시청자 71%가 첫 3초 안에 계속 볼지 결정한다 | [TTS Vibes 2025 (업계 리포트 재인용, 1차 출처 미확인)](https://insights.ttsvibes.com/tiktok-first-3-seconds-hook-retention-rate/) |

### 기각안

- **B** pattern-interrupt × deadpan-humor × flat-cartoon — "출근 안 하면 큰일 나는 남자. 오늘은 벌레라서 못 갔다." (주근거 A-1)
- **C** bold-claim × awe × cinematic-realism — "백 년 넘게 읽히는 이유가 첫 문장 하나에 있다." (주근거 A-3)

## 타임라인

스타일 락: monochrome ink line art, thin clean strokes, flat white background, minimal hatching for shadow, no color · 캐릭터: a gaunt man in his early thirties, short dark hair, hollow cheeks, thin frame, wearing a rumpled grey shirt

| 샷 | 구간 | 화면 | 카메라 | SFX | 내레이션 |
|---|---|---|---|---|---|
| 1 | 00:00.000–00:03.000 | a gaunt man lying in a narrow bed in a dim room, staring at the ceiling, one thin arm raised stiffly above him | The camera pushes in with small amplitude at slow speed toward his wide-open eyes | the muffled ticking of an alarm clock | 아침에 눈을 떴는데 |
| 2 | 00:03.000–00:10.500 | a low angle from the floorboards: his silhouette now hunched and insect-like against the closed bedroom door, a plate of bread pushed under the door by an unseen hand | The camera tilts up with small amplitude at slow speed | a key turning in a lock, then footsteps receding down a hallway | 몸이 벌레로 변해 있었다 / 가족은 그를 방에 가뒀고 / 세상은 아무렇지 않게 |
| 3 | 00:10.500–00:15.000 | a wide view of a grey city street at morning rush hour, commuters streaming past a shuttered apartment window on the second floor | The camera trucks right with medium amplitude at slow speed | crowd murmur and a distant tram bell | 출근을 재촉했다 / 카프카, 변신 |

앰비언스: A quiet apartment interior with a faint clock tick and wooden floor creaks, giving way to a muffled city outside — traffic hum, a tram bell, indistinct crowd murmur. No music inside the scene.

BGM: A single sustained cello note with slow, sparse pizzicato underneath, around 60 BPM, barely audible at first and swelling slightly in the final four seconds.

## 자막 큐

총 49음절 (상한 75) · 큐 6개 · 제목 카드 12.5s "변신 · 프란츠 카프카"

| 시작 | 끝 | 자막 (줄바꿈 = /) |
|---|---|---|
| 0:00:00.40 | 0:00:02.80 | 아침에 눈을 떴는데 |
| 0:00:03.20 | 0:00:05.80 | 몸이 벌레로 변해 / 있었다 |
| 0:00:06.20 | 0:00:08.60 | 가족은 그를 방에 / 가뒀고 |
| 0:00:09.00 | 0:00:11.20 | 세상은 아무렇지 않게 |
| 0:00:11.50 | 0:00:13.00 | 출근을 재촉했다 |
| 0:00:13.40 | 0:00:14.80 | 카프카, 변신 _(음성만 — 제목 카드가 표시)_ |

## 콘티

시트: `contisheet.html` / `contisheet.png` · 패널: `panels/` · 프롬프트: `panel-prompts.txt`

| # | 샷 | 샷 타입 | VIDEO | AUDIO |
|---|---|---|---|---|
| 01 | 1 | medium close-up | 어두운 방, 침대에 누운 그레고르. 천장을 본다. 한쪽 팔이 뻣뻣하게 들려 있다 | NA) 아침에 눈을 떴는데 / S.E) 알람 시계 초침 소리 |
| 02 | 1 | extreme close-up | 크게 뜬 눈. 눈동자에 마디 진 벌레 다리가 비친다 | S.E) 초침 소리가 멈춘다 |
| 03 | 2 | low angle wide shot | 바닥에서 올려다본 앵글. 닫힌 문에 붙은 벌레 같은 실루엣 | NA) 몸이 벌레로 변해 있었다 / S.E) 열쇠 돌리는 소리 |
| 04 | 2 | close-up | 문 아래로 밀려 들어오는 빵 접시. 손은 보이지 않는다 | NA) 가족은 그를 방에 가뒀고 / S.E) 멀어지는 발소리 |
| 05 | 3 | wide shot | 출근길 도심. 인파가 흐르고, 2층 창문 하나만 닫혀 있다 | NA) 세상은 아무렇지 않게 출근을 재촉했다 / NA) 카프카, 변신 / S.E) 트램 종소리 |

## 제작 절차

1. `h3-prompt.txt` 내용을 MiniMax H3(Hailuo)에 붙여넣기 — 9:16, 15초, 1440p. 레퍼런스가 필요하면 `panels/`의 PNG를 최대 9장 첨부
2. 결과 mp4를 이 폴더에 `input.mp4`로 저장
3. PowerShell에서 `.\burn.ps1` 실행 → `output.mp4` (자막 번인)
4. 똑똑 관리자 → 게시물 → 영상 게시물 → `output.mp4` 업로드, 도서 연결, 발행

## 검증

통과.
