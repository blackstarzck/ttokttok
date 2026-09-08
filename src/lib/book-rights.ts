/**
 * @file 등록 가능 여부의 단일 원천 (PRD §5.11).
 *
 * **`import "server-only"`를 넣지 말 것.** `scripts/sync-wikisource-works.mjs`와
 * vitest(node 환경)가 이 파일을 import한다.
 *
 * 이 파일이 있는 이유: 명단이 `books/import/actions.ts`의 모듈 private
 * 상수였고, 그 파일은 `"use server"`라 export가 전부 서버 액션이 되므로
 * 목록 화면이 쓸 수 없었다. 두 벌이 되면 한쪽만 고쳐진다.
 */

/**
 * 저작자 이름을 조회 키로 정규화한다.
 *
 * macOS Finder·클립보드 경로는 한글을 NFD(자모 분해)로 내놓기도 하고, 폭
 * 없는 문자(zero-width space 등)가 붙어 들어오기도 한다 — 둘 다 이 조회를
 * 조용히 실패시켜 금지 저작자를 그냥 통과시킨다. 이건 우회를 막는 관문이
 * 아니라 실수로 새는 걸 막는 관문이라, 놓치는 쪽이 진짜 실패다.
 *
 * 아래 목록의 키를 만들 때도, 입력을 조회할 때도 **반드시 이 함수 하나만**
 * 거친다 — 각자 따로 정규화하면 훗날 공백이 낀 이름("김 기림")이 한쪽에서만
 * 걸러져 서로 어긋나고, 차단해야 할 저작자가 조용히 통과한다.
 */
export function normalizeAuthorKey(name: string): string {
  // 폭 없는 문자는 반드시 \u 이스케이프로 쓴다 — 소스에 그대로 넣으면
  // 보이지 않아 나중에 아무도 이 문자 집합을 읽을 수 없다.
  return name.normalize("NFC").replace(/[\s\u200B\u200C\u200D\u00AD]/g, "");
}

/**
 * 등록 금지 저작자 (PRD §5.11).
 *
 * 위키문헌에 문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이
 * 여기다 — 위키문헌은 우리와 다른 기준으로 운영된다. 그래서 위키문헌
 * 경로(임포트·목록)에만 관문을 둔다. 수동 등록(saveBook)은 막지 않는다:
 * 손으로 적어 넣는 행위에는 이런 오독이 끼어들지 않는다.
 *
 * `Map`으로 두는 이유: 객체 리터럴이면 `BLOCKED_AUTHORS["constructor"]` 같은
 * 프로토타입 키 조회가 함수를 반환해 "차단됨"으로 오판된다.
 */
const BLOCKED_AUTHORS = new Map<string, string>(
  (
    [
      ["정지용", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["이태준", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["박태원", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["홍명희", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["김기림", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["백석", "1996년 사망 — 저작권이 존속합니다 (사후 70년)"],
      ["박경리", "2008년 사망 — 저작권이 존속합니다 (사후 70년)"],
    ] as const
  ).map(([name, reason]) => [normalizeAuthorKey(name), reason] as const),
);

/** 금지 저작자면 사유를, 아니면 null. */
export function blockedAuthorReason(
  author: string | null | undefined,
): string | null {
  if (!author) return null;
  return BLOCKED_AUTHORS.get(normalizeAuthorKey(author)) ?? null;
}

/**
 * 후보를 목록에 **보일지** 판정한다.
 *
 * `wikisource-meta.ts`의 `isCandidate`가 "표에 담을지"를 정하고, 이 함수가
 * "화면에 보일지"를 정한다. 둘을 한 함수에 섞으면 표에서 지워야 할 것과
 * 가려야 할 것이 구별되지 않는다 — 표에서 지우면 "왜 이 작품이 목록에
 * 없나"를 나중에 DB에서 답할 수 없다.
 *
 * 저자가 비어 있는 것은 가리는 사유가 아니다. 「강촌 (두보)」처럼 다른 틀을
 * 쓰는 문서(99개 중 1개)는 목록에 남고, 가져올 때 저자를 입력받는다.
 */
export function isListable(work: {
  author: string | null;
  translator: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const blocked = blockedAuthorReason(work.author);
  if (blocked) return { ok: false, reason: `등록 금지 저작자 — ${blocked}` };

  // PRD §5.11: 원작의 저작권이 만료여도 번역본의 저작권은 별개다.
  if (work.translator) {
    return { ok: false, reason: `번역물 — 역자 ${work.translator}의 저작권이 별개입니다` };
  }

  return { ok: true };
}
