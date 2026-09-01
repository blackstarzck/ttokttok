# 카드 텍스트 길이 상한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 훅·부연 설명에 글자 수 상한을 두어, 오버레이 전환으로 좁아진 카드 본문에서 텍스트가 조용히 잘리는 것을 막는다.

**Architecture:** 상한값은 `REGION_REGISTRY`의 영역 항목에 산다 — `input`·`required`가 이미 사는 자리라 새 개념을 만들지 않는다. 편집기가 그 값으로 입력을 막고 카운터를 그리고, 서버 액션이 같은 값으로 저장을 거부한다. 브라우저 `maxLength`는 formData 위조로 우회되므로 서버 검사는 중복이 아니라 다른 신뢰 경계다.

**Tech Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Tailwind CSS v4 · shadcn/ui · TypeScript

## Global Constraints

설계 근거는 `docs/superpowers/specs/2026-09-01-card-text-length-limits-design.md`다. 아래는 그 스펙에서 그대로 옮긴 값이며, 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **상한: 훅 60자 · 부연 90자.** 다른 영역(커버·장르·서지)은 텍스트 입력이 없으므로 상한을 갖지 않는다.
- **세는 단위는 `String.length`** (UTF-16 코드 유닛). 브라우저 `maxLength`와 같은 방식이라 편집기와 서버가 어긋나지 않는다. `Intl.Segmenter`나 코드포인트 단위로 바꾸지 않는다.
- **서버 검사 대상은 `.trim()` 이후 값**이다. `readCardLayout()`이 이미 `.trim()`한 뒤 필수 여부를 판단하므로 같은 값에 길이를 잰다.
- **카운터는 상한의 90% 이상**(훅 54자 / 부연 81자)에서 `text-destructive`로 바뀐다. 그 미만은 `text-muted-foreground`.
- **`maxLength`가 없는 영역에는 카운터를 렌더하지 않는다.**
- 서버 오류는 **기존 규약**을 그대로 따른다 — `readCardLayout()`이 `{ error: string }`을 반환하고 호출부가 `redirect(...?error=...)`로 노출한다. 새 오류 처리 방식을 만들지 않는다.
- **기존 콘텐츠는 전부 상한 안이다** (DB 훅 최장 20자 / 시드 파일 훅 최장 54자 / 부연 양쪽 43자). 마이그레이션도 시드 수정도 하지 않는다.

## 이 저장소에는 테스트 러너가 없다

`package.json`에 `vitest`·`jest`·`playwright`가 **없다.** 완료 기준은 `docs/FRONTEND.md` §7이 정한 `npm run build` 통과 + 375px 실제 렌더 확인이다. 테스트 프레임워크를 새로 도입하지 않는다 — 이 작업의 범위가 아니다.

각 태스크는 빌드 + 소스 grep으로 검증하고, 실제 폼 동작 확인은 컨트롤러가 브라우저에서 직접 한다.

`npm run lint`에는 이 브랜치 이전부터 존재하는 에러 5건이 있다. **신규 증가만 결함이다.**

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/components/cards/registry.ts` | `RegionEntry` 타입에 `maxLength` 추가 | 수정 |
| `src/components/cards/regions.tsx` | `hookRegion`·`descRegion`에 실제 상한값 | 수정 |
| `src/app/admin/(dashboard)/posts/actions.ts` | `readCardLayout()`에 길이 검사 | 수정 |
| `src/components/admin/post-editor.tsx` | `maxLength` 속성 + 카운터 | 수정 |

새 파일은 없다. 상한값이 `REGION_REGISTRY` 한 곳에 살고 나머지 셋이 그것을 읽는 구조라, 값을 바꿀 때 고칠 곳이 하나다.

---

### Task 1: 상한값을 레지스트리에 두고 서버가 강제한다

이 태스크가 끝나면 **저장 경로가 막힌다.** 편집기는 아직 입력을 안 막으므로, 관리자가 61자를 넣고 저장하면 오류 메시지를 본다 — 친절하진 않지만 깨진 상태는 아니다. Task 2가 해소한다.

**Files:**
- Modify: `src/components/cards/registry.ts`
- Modify: `src/components/cards/regions.tsx`
- Modify: `src/app/admin/(dashboard)/posts/actions.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `RegionEntry`에 선택 필드 `maxLength?: number`. `REGION_REGISTRY.hook.maxLength === 60`, `REGION_REGISTRY.desc.maxLength === 90`. 나머지 영역(`cover`·`genre`·`biblio`)은 이 필드를 갖지 않아 `undefined`다.

- [ ] **Step 1: `RegionEntry`에 `maxLength`를 추가한다**

`src/components/cards/registry.ts`에서 `RegionEntry` 타입을 찾아 `required` 아래에 한 줄을 넣는다.

교체 전:

```ts
export type RegionEntry = {
  label: string;
  /** 관리자 텍스트 입력 종류. null이면 도서에서 자동으로 채워진다. */
  input: "text" | "textarea" | null;
  /** input이 있는 영역만 의미가 있다. */
  required: boolean;
  /** 저장된 variant가 사라졌을 때 여기로 폴백한다. */
  defaultVariant: string;
  variants: Record<string, RegionVariant>;
};
```

교체 후:

```ts
export type RegionEntry = {
  label: string;
  /** 관리자 텍스트 입력 종류. null이면 도서에서 자동으로 채워진다. */
  input: "text" | "textarea" | null;
  /** input이 있는 영역만 의미가 있다. */
  required: boolean;
  /**
   * 글자 수 상한 (String.length 기준 — 브라우저 maxLength와 같은 단위라
   * 편집기와 서버가 어긋나지 않는다).
   *
   * 오버레이 전환으로 카드 본문 가용 폭이 22% 줄고 overflow-hidden이
   * 붙어서, 넘친 텍스트가 스크롤 없이 잘려 사라진다. 근거와 실측은
   * docs/superpowers/specs/2026-09-01-card-text-length-limits-design.md.
   *
   * input이 있는 영역만 의미가 있다.
   */
  maxLength?: number;
  /** 저장된 variant가 사라졌을 때 여기로 폴백한다. */
  defaultVariant: string;
  variants: Record<string, RegionVariant>;
};
```

- [ ] **Step 2: 훅과 부연에 상한값을 준다**

`src/components/cards/regions.tsx`에서 두 곳을 고친다.

① `hookRegion` — 교체 전:

```tsx
export const hookRegion: RegionEntry = {
  label: "훅",
  input: "text",
  required: true,
  defaultVariant: "a",
```

교체 후:

```tsx
export const hookRegion: RegionEntry = {
  label: "훅",
  input: "text",
  required: true,
  // 시드의 원문 인용(최장 54자)을 담으면서 375px에서 5줄 안에 들어가는 값.
  maxLength: 60,
  defaultVariant: "a",
```

② `descRegion` — 교체 전:

```tsx
export const descRegion: RegionEntry = {
  label: "부연 설명",
  input: "textarea",
  required: false,
  defaultVariant: "a",
```

교체 후:

```tsx
export const descRegion: RegionEntry = {
  label: "부연 설명",
  input: "textarea",
  required: false,
  // 기존 최장 43자에 2배 여유. 375px에서 5줄.
  maxLength: 90,
  defaultVariant: "a",
```

- [ ] **Step 3: 서버 액션이 길이를 검사한다**

`src/app/admin/(dashboard)/posts/actions.ts`의 `readCardLayout()` 안에서 `entry.input` 블록을 고친다.

교체 전:

```ts
    if (entry.input) {
      const text = String(formData.get(`region-${key}-text`) ?? "").trim();
      if (text) value.text = text;
      else if (entry.required) {
        return { error: `${entry.label} 문구를 입력해야 합니다` };
      }
    }
```

교체 후:

```ts
    if (entry.input) {
      const text = String(formData.get(`region-${key}-text`) ?? "").trim();
      if (text) {
        // 브라우저 maxLength는 formData 위조로 우회된다 — 편집기 제한과
        // 중복이 아니라 다른 신뢰 경계다. trim 이후 값을 재므로 앞뒤
        // 공백만으로 상한을 넘길 수 없다.
        if (entry.maxLength && text.length > entry.maxLength) {
          return {
            error: `${entry.label} 문구는 ${entry.maxLength}자까지 입력할 수 있습니다 (현재 ${text.length}자)`,
          };
        }
        value.text = text;
      } else if (entry.required) {
        return { error: `${entry.label} 문구를 입력해야 합니다` };
      }
    }
```

- [ ] **Step 4: 빌드와 정적 검증**

Run: `npm run build`
Expected: 성공. `maxLength`는 선택 필드라 `cover`·`genre`·`biblio` 영역 정의는 타입 오류 없이 그대로 컴파일된다.

Run: `grep -n "maxLength" src/components/cards/registry.ts src/components/cards/regions.tsx "src/app/admin/(dashboard)/posts/actions.ts"`
Expected:
- `registry.ts` **2건** — 타입 선언(`maxLength?: number;`)과 JSDoc의 "브라우저 maxLength와 같은 단위라" 문구
- `regions.tsx` **2건** — 60, 90
- `actions.ts` **3건** — 주석의 "브라우저 maxLength는", 조건문(한 줄에 두 번), 오류 메시지

주석 문구 자체가 `maxLength`라는 단어를 담으므로 코드 참조보다 매치 수가 많다.

Run: `npm run lint`
Expected: 기존 5건 그대로, 신규 0건.

- [ ] **Step 5: 시드가 상한을 넘지 않는지 확인한다**

상한이 시드를 거부하면 `npm run seed`가 깨진다. 실제로 세어 확인한다.

```bash
node -e "
const s=require('fs').readFileSync('scripts/seed.mjs','utf8');
const hooks=[...s.matchAll(/hook:\s*\{[\s\S]{0,120}?text:\s*[\"'\`]([^\"'\`]*)[\"'\`]/g)].map(m=>m[1].length);
const descs=[...s.matchAll(/desc:\s*[\"'\`]([^\"'\`]*)[\"'\`]/g)].map(m=>m[1].length);
console.log('훅  최장', Math.max(...hooks), '/ 60 → 초과', hooks.filter(n=>n>60).length, '건');
console.log('부연 최장', Math.max(...descs), '/ 90 → 초과', descs.filter(n=>n>90).length, '건');
"
```

Expected:
```
훅  최장 54 / 60 → 초과 0 건
부연 최장 43 / 90 → 초과 0 건
```

초과가 1건이라도 나오면 **멈추고 보고해라** — 상한값 재검토가 필요하다. 시드를 임의로 자르지 마라.

- [ ] **Step 6: 커밋**

```bash
git add src/components/cards/registry.ts src/components/cards/regions.tsx "src/app/admin/(dashboard)/posts/actions.ts"
git commit -m "feat(cards): 훅 60자·부연 90자 상한을 레지스트리에 두고 서버가 강제"
```

---

### Task 2: 편집기가 입력을 막고 남은 글자를 보여준다

**Files:**
- Modify: `src/components/admin/post-editor.tsx`

**Interfaces:**
- Consumes: Task 1의 `RegionEntry.maxLength` (`entry.maxLength`로 접근, `undefined`일 수 있음)
- Produces: 없음

- [ ] **Step 1: `cn` 유틸을 import한다**

`src/components/admin/post-editor.tsx`의 import 블록 맨 아래(`import type { FeedCardLayout } ...` **위**)에 한 줄을 넣는다:

```ts
import { cn } from "@/lib/utils";
```

이 파일은 아직 `cn`을 쓰지 않는다 — 카운터 색을 조건부로 주기 위해 새로 필요하다.

- [ ] **Step 2: 입력란에 `maxLength`를 걸고 카운터를 붙인다**

같은 파일에서 `entry.input ? (...)` 블록을 고친다.

교체 전:

```tsx
                {entry.input ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`region-${key}-text`}>
                      문구{entry.required ? " *" : ""}
                    </Label>
                    {entry.input === "textarea" ? (
                      <Textarea
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        rows={3}
                        value={value.text}
                        required={entry.required}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    ) : (
                      <Input
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        value={value.text}
                        required={entry.required}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    )}
                  </div>
                ) : (
```

교체 후:

```tsx
                {entry.input ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`region-${key}-text`}>
                      문구{entry.required ? " *" : ""}
                    </Label>
                    {entry.input === "textarea" ? (
                      <Textarea
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        rows={3}
                        value={value.text}
                        required={entry.required}
                        maxLength={entry.maxLength}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    ) : (
                      <Input
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        value={value.text}
                        required={entry.required}
                        maxLength={entry.maxLength}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    )}

                    {/* 상한이 있는 영역만 카운터를 둔다. 90%를 넘으면 색으로
                        근접을 알린다 — 카드 본문이 좁아 넘친 텍스트는 스크롤
                        없이 잘리므로, 저장 후에야 알면 늦다. */}
                    {entry.maxLength ? (
                      <p
                        className={cn(
                          "self-end text-xs tabular-nums",
                          value.text.length >= entry.maxLength * 0.9
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {value.text.length}/{entry.maxLength}
                      </p>
                    ) : null}
                  </div>
                ) : (
```

- [ ] **Step 3: 빌드와 정적 검증**

Run: `npm run build`
Expected: 성공.

Run: `grep -n "maxLength\|tabular-nums\|text-destructive" src/components/admin/post-editor.tsx`
Expected: `maxLength` 3건(Textarea, Input, 카운터 조건), `tabular-nums` 1건, `text-destructive` 1건.

Run: `npm run lint`
Expected: 기존 5건 그대로, 신규 0건.

- [ ] **Step 4: 커밋**

```bash
git add src/components/admin/post-editor.tsx
git commit -m "feat(admin): 카드 문구 입력에 글자 수 제한과 카운터 추가"
```

---

## 최종 검증 (컨트롤러가 브라우저에서 수행)

`npm run dev` 후 `/admin/posts/new`를 열고 확인한다. 서브에이전트는 이 절을 수행하지 않는다.

**편집기:**

- 훅 입력란 아래에 `0/60`, 부연 아래에 `0/90` 카운터가 있다
- 커버·장르·서지 영역에는 카운터가 **없다** (`선택한 도서에서 자동으로 채워집니다` 문구만)
- 훅에 61자를 붙여넣으면 60자에서 잘린다
- 훅이 54자에 도달하면 카운터 색이 바뀐다 (`text-destructive`)
- 부연은 81자에서 색이 바뀐다

콘솔 확인용 스니펫:

```js
const hook = document.querySelector('#region-hook-text');
const desc = document.querySelector('#region-desc-text');
// fieldset 안으로 한정한다 — 우측 미리보기가 렌더하는 PostItem의 좋아요·
// 댓글·공유 카운트도 tabular-nums를 쓰므로, 전역 조회는 그것들까지 잡는다.
const counters = [...document.querySelectorAll('fieldset .tabular-nums')]
  .map(el => el.textContent);
console.table({
  '훅 maxLength': hook?.maxLength,
  '부연 maxLength': desc?.maxLength,
  '카운터 개수': counters.length,
  '카운터 내용': counters.join(' · '),
});
```

Expected: 훅 60, 부연 90, 카운터 2개, 내용 `0/60 · 0/90` (빈 폼 기준).

**서버 방어선** — 브라우저 제한을 우회해도 막히는지:

```js
const hook = document.querySelector('#region-hook-text');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
hook.removeAttribute('maxlength');
setter.call(hook, '가'.repeat(61));
hook.dispatchEvent(new Event('input', { bubbles: true }));
console.log('길이:', hook.value.length);
```

그 다음 채널·도서를 고르고 저장하면 `훅 문구는 60자까지 입력할 수 있습니다 (현재 61자)` 오류가 뜨고 **저장되지 않아야** 한다.

**회귀 확인:**

- 기존 게시물(`/admin/posts/{id}` 편집)이 열리고, 카운터가 현재 길이를 정확히 표시한다
- 상한 안의 정상 문구로 저장이 통과한다
- `npm run seed`가 통과한다 (Task 1 Step 5에서 정적으로 확인했지만, 실제 실행은 DB를 덮어쓰므로 컨트롤러가 필요하다고 판단할 때만)

## 스펙 정정

스펙 본문이 서버 액션 함수명을 `readLayout()`으로 적었으나 실제 이름은 **`readCardLayout()`**이다. Task 1 Step 3에서 올바른 함수를 고치므로 구현에는 영향이 없지만, 스펙 문구도 같이 고친다:

- [ ] `docs/superpowers/specs/2026-09-01-card-text-length-limits-design.md`에서 `readLayout()` 2곳을 `readCardLayout()`으로 바꾸고, Task 2 커밋에 함께 담는다.

## 롤백

두 태스크가 독립 커밋이다. Task 2만 되돌리면 서버 제한은 남고 편집기 카운터만 사라지므로 안전하다. Task 1을 되돌리면 `entry.maxLength`가 사라져 Task 2의 카운터가 렌더되지 않지만(조건이 `undefined`), 타입상 오류는 없다 — **둘을 함께 되돌리는 편이 깔끔하다.**
