# 3D 표지 — 이미지 템플릿 (면별 원본 이미지)

작성일 2026-09-11 · 상태: 승인됨(1~3절 대화 승인, 4~5절 구현 전제) · 선행: PRD §5.10 「3D 표지 제작」, `20260910000001_book_cover_design.sql`

## 문제

관리자 3D 표지 편집기의 「커버 템플릿」은 클래식·모던·문학 — 전부 제목·저자 글자로 캔버스에 그리는 템플릿이다. 실제 표지 원본(스캔·디자인 파일)이 있는 도서는 3D 모델에 얹을 방법이 없다.

이미지를 얹을 때의 함정은 색이다. 책 모델은 **판(RoundedBox, 둥근 모서리 2.5mm)** 위에 판보다 3.25mm 작은 **그림면(Plane)** 을 얹고, 판·책등판·모서리는 `binding` 재질(팔레트 `base`), 머리띠는 `accent`로 칠한다. 지금 템플릿은 텍스처 바탕도 같은 `base`라 이음새가 보이지 않지만, 이미지를 얹으면 판 테두리·둥근 모서리·책등·머리띠 색이 이미지와 갈린다.

## 결정 (대화)

| 질문 | 결정 |
|---|---|
| 이미지가 붙는 면 | **앞·책등·뒤 각각 업로드.** 앞표지 필수, 책등·뒷표지 선택 |
| 이미지가 덮지 않는 부위의 색 | **앞표지 이미지 가장자리에서 자동 추출.** 관리자 조작 없음 |
| 다시 편집 | **원본 이미지도 저장** — `covers/{bookId}/` 아래 WebP, `cover_design.images`에 URL |
| 저장 경로 | **폼 한 번에 제출**(접근 1). 클라이언트가 축소한 WebP를 렌더 PNG와 함께 기존 `saveBook`으로 보낸다. Storage 직접 업로드(접근 2)는 신규 도서 id 규약·고아 파일·URL 신뢰 문제로 기각 |

## 1. 데이터 모델 — `packages/shared/src/cover-design.ts`

`version: 1` 유지, 필드 추가만. 기존 저장값은 그대로 파싱된다.

- `COVER_TEMPLATES`에 `{ id: "image", label: "이미지", description: "표지 원본 이미지를 면별로 올립니다" }`.
- `COVER_FACES = ["front", "spine", "back"]` — UI·검증 순서.
- `images?: { front: string; spine?: string; back?: string }` — 각 값은 http(s) 공개 URL(저장됨) 또는 `blob:`(편집 중 로컬), 2048자 이내. **서버는 이 값을 신뢰하지 않는다** — 업로드 결과 또는 기존 행의 값으로만 확정한다(게시글 배경과 같은 원칙).
- `template === "image"`이면 `images.front` 필수(refine).
- `palette`는 이미지 템플릿에서 무시되지만 남긴다 — 다른 템플릿으로 되돌릴 때 이전 팔레트가 살아 있고, union으로 쪼갤 이유가 없다.
- 파생 색은 저장하지 않는다. 렌더러가 매번 앞표지 픽셀에서 계산한다(단일 진실 = 이미지).
- `packages/shared/src/cover-colors.ts` — `deriveCoverColors(pixels, width, height) → { base, ink: "light" | "dark", accent }`. DOM 의존 없음. 바깥 8% 테두리 픽셀 sRGB 평균 = `base`; `base` 상대 명도 > 0.45면 `ink: "dark"` 아니면 `"light"`; `accent` = base를 잉크 색 방향으로 35% 섞은 값. 잉크의 실제 색은 새 토큰 `--book-cover-image-ink-{dark,light}`(theme.css + DESIGN.md 동시 갱신).
- 저장 경로 규약: `covers/{bookId}/design-{face}-{uuid}.webp`. 렌더 PNG(`{bookId}/{uuid}.png`)와 같은 폴더라 "이 도서의 파일" 판별(`startsWith("{bookId}/")`)이 그대로 통한다.
- DB: 컬럼 주석만 갱신하는 마이그레이션 1건. 제약 변경 없음.

## 2. 렌더러 — `apps/admin/src/lib/book-cover-renderer.ts`

`render(design, images?)` / `exportImage(design, images?)` — `images: Partial<Record<CoverFace, ImageBitmap>>`. 렌더러는 파일·URL·fetch를 모르고 픽셀만 받는다.

**색 결정은 한 곳.** 텍스처를 다시 그릴 때 `CoverColors { base, ink, accent }`를 만들어 텍스처 3장·`binding.color`(base)·`binding.sheenColor`(ink)·`headband.color`(accent)가 같은 객체를 읽는다. 기존 템플릿은 팔레트 토큰, 이미지 템플릿은 앞표지 비트맵을 64×96 캔버스에 그려 `getImageData` → `deriveCoverColors` → ink 토큰 치환. 이음새 색이 이미지 가장자리와 같은 값에서 나온다.

**면별 텍스처.**
- 이미지가 있는 면: 텍스처 캔버스에 비트맵을 **그림면(plane) 비율로 중앙 크롭해 채운다.** 앞·뒤 그림면은 124.5:213.5, 책등은 `(depth−0.02):(height−0.04)`로 두께에 따라 변한다. 캔버스(800×1200, 180×1200)가 그림면에 늘어 붙으며 생기는 기존의 가로 눌림을 이 크롭이 상쇄해 사진이 왜곡되지 않는다. 글자·테두리·grain은 그리지 않는다.
- 이미지가 없는 면(책등·뒤 선택 안 함): 지금의 책등·뒷표지 레이아웃(제목·저자·구분선·grain)을 파생 색으로 그린다.

**재생성 키.** `[template, palette, title, author]` + `images`의 URL 문자열 + (이미지 템플릿일 때만) `thickness` — 책등 그림면 비율이 두께에 따라 바뀌어 책등 텍스처를 다시 크롭해야 한다.

**기하는 손대지 않는다.** 그림면 크기·모서리 반경 그대로. 테두리 띠는 남지만 그 색이 이미지 가장자리 평균색이라 "천 장정 위에 인쇄지를 붙인" 양장본으로 읽힌다. 그림면을 모서리까지 넓히면 기존 3개 템플릿까지 바뀐다.

## 3. 편집기 — `book-cover-designer.tsx` · `book-cover-field.tsx`

**면 이미지 준비 — `apps/admin/src/lib/cover-face-image.ts`(클라이언트).** `prepareFaceImage(source: File | string) → { bitmap, upload: File | null, url }`
- `File`이면 `createImageBitmap`(EXIF 회전 반영), URL이면 `fetch(url, { mode: "cors" })` → blob → 비트맵(저장된 WebP를 다시 열 때).
- `File`은 1200×1800 안으로 축소해 `toBlob("image/webp", 0.86)`(불가 시 JPEG 0.86)으로 전송용 파일을 만든다. 서버로 가는 것은 면당 수백 KB — 4MB 본문 예산을 지킨다. URL 입력이면 `upload: null`(저장된 URL을 그대로 쓰는 면).
- 반환 `url`은 `File`이면 blob: URL, URL 입력이면 그 URL. 이 문자열이 `design.images.{face}`와 텍스처 키에 들어간다.
- 받는 파일: JPEG·PNG·WebP, 원본 10MB 이하.

**편집기 상태.** `faces: Partial<Record<CoverFace, { bitmap, upload, url }>>` (`useState`). 언마운트·교체 시 `bitmap.close()`와 blob URL 해제.

**커버 템플릿 fieldset** — 4번째 「이미지」. 선택 시 「표지 색상」 fieldset을 숨기고 "판·책등·머리띠 색은 앞표지 이미지 가장자리에서 정해집니다" + 파생 색 견본 3점(렌더러 `onColors` 콜백으로 받는다 — 계산 중복 없음). 면별 업로드 3행(앞표지 필수·책등·뒷표지): 파일 입력 + 썸네일 + 「제거」(선택 면). 도움말: "그림면 비율로 중앙을 채우며 가장자리가 잘릴 수 있습니다. 책등은 두께 슬라이더에 맞춰 잘립니다." 안 올린 면: "제목·저자로 그립니다." 「이미지로 적용」은 앞표지 비트맵 준비 전 disabled. 저장 URL 로딩 중 `role="status"`, 실패 시 행 오류 + 적용 disabled.

**`onApply(file, design, faceUploads)`** — `upload`가 있는 면만.

**`BookCoverField`** — 숨은 파일 입력 `cover_image_{front,spine,back}` 추가, `apply()`에서 `DataTransfer`로 채우고 `reset()`·직접 업로드에서 비운다. 편집을 닫을 때 면 파일을 `appliedFaces`에 보관해 다시 열 때 `File`을 우선 넘긴다(blob URL은 해제될 수 있다). 저장 뒤에는 `savedDesign.images`의 http URL로 연다.

## 4. 서버 저장·회수 — `apps/admin/src/lib/book-cover-images.ts` · `books/actions.ts`

`prepareCoverImages(form, design, previous, bookId)`:
1. **검증은 업로드 전에 끝낸다.** 면마다 `cover_image_{face}` 파일이 있으면 JPEG/PNG/WebP · 1.5MB 이하 · sharp 해독(`limitInputPixels`) · `rotate()` · 1200×1800 `inside` 축소 · WebP q85 → 버퍼. 파일이 없으면 `design.images[face]`가 **기존 행의 `cover_design.images[face]`와 같을 때만** 유지. 선택 면은 값이 없으면 생략. 앞표지가 둘 다 아니면 오류 "앞표지 이미지를 다시 올려 주세요".
2. 버퍼를 `covers/{bookId}/design-{face}-{uuid}.webp`에 업로드(`upsert: false`), `uploaded[]`에 기록, URL 확정.
3. 최종 `images`를 돌려준다.

`saveBook` 통합:
- 수정이고 표지가 있으면 기존 `select("cover_url")`을 `cover_url, cover_design`으로 넓혀 `previous`로 넘긴다.
- 이미지 템플릿이면 `prepareCoverImages` 결과를 `values.cover_design.images`에 넣는다. 실패는 기존 `fail()` — 새 표지 PNG·면 이미지 모두 고유 경로라 함께 회수한다.
- DB 저장 성공 뒤: 이전 `cover_design.images`의 경로 중 새 `images`에 없는 것을 `{bookId}/` 접두 확인 후 `removeUploaded`. 직접 업로드로 `cover_design`이 비워질 때는 이전 면 이미지 전부.
- `deleteBook`: `cover_design`도 읽어 면 이미지 경로를 고아 목록에 더한다.

## 5. 테스트·문서

- vitest: `cover-design.test.ts` — 이미지 템플릿 파싱, 앞표지 없는 이미지 템플릿 거부, 기존 데이터 호환. `cover-colors.test.ts` — 단색·어두운/밝은 테두리·accent 혼합.
- e2e `admin.cover.spec.ts` 추가 시나리오: 이미지 템플릿 선택 → 앞(테두리가 단색인 PNG)·책등·뒤 업로드 → 적용 → 저장. DB `cover_design.template === "image"`, `images.*` URL 200 + WebP, 저장 경로 `{bookId}/design-*`. 렌더 PNG의 불투명 픽셀 평균색이 테두리색 쪽인지(파생 색 검증). 다시 열어 재업로드 없이 각도만 바꿔 적용·저장 → 같은 URL 유지. 책등 제거 후 저장 → 책등 파일 회수. 직접 업로드로 교체 → 면 이미지 전부 회수. 375px 가로 스크롤 없음.
- 문서: PRD §5.10 3D 표지 문단 + §6 `cover_design` 주석 + §11 결정 기록; DESIGN.md 3D 편집기 항목 + 새 토큰; FRONTEND.md 게시글 배경 절의 "폼의 이미지 주소는 신뢰하지 않는다"를 표지에도 적용한다고 한 줄.

## 비목표

- 펼친 재킷 한 장 자동 분할, 그림면 확장·모서리 둥근 텍스처, 관리자 색 덮어쓰기, 독자 화면 변경(독자는 렌더 PNG만 읽는다).
