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

/**
 * 금지 저작자면 사유를, 아니면 null.
 *
 * **괄호 앞의 이름으로도 조회한다.** 실측한 저자 이름에 「김소월(김정식)」·
 * 「이정호(李定鎬)」처럼 괄호가 붙은 형태가 있다. 정규화는 공백과 폭 없는
 * 문자만 걷어내므로, 「정지용(鄭芝溶)」이 들어오면 명단을 통과해 버린다.
 * 놓치는 쪽이 진짜 실패인 관문이라 두 형태를 모두 본다.
 */
export function blockedAuthorReason(
  author: string | null | undefined,
): string | null {
  if (!author) return null;

  const direct = BLOCKED_AUTHORS.get(normalizeAuthorKey(author));
  if (direct) return direct;

  const bare = author.replace(/\s*[(（].*$/, "");
  if (bare && bare !== author) {
    return BLOCKED_AUTHORS.get(normalizeAuthorKey(bare)) ?? null;
  }
  return null;
}

/**
 * 후보를 목록에 **보일지** 판정한다.
 *
 * `wikisource-meta.ts`의 `isCandidate`·`checkAuthor`·`eraConsistent`가
 * "표에 담을지"를 정하고(장르·PD 태그 관문에 더해 사망 연도·국적까지),
 * 이 함수는 그 뒤에 남은 행 중 "화면에 보일지"를 정한다. 둘을 한 함수에
 * 섞으면 표에서 지워야 할 것과 가려야 할 것이 구별되지 않는다 — 표에서
 * 지우면 "왜 이 작품이 목록에 없나"를 나중에 DB에서 답할 수 없다.
 *
 * **이 함수가 실제로 거르는 것은 2026-09-09 기준 이렇게 갈린다:**
 * - **금지 저작자는 여전히 표에 남고 화면에서만 가려진다.** 저자 문서의
 *   사망 연도·국적만으로는 「저자:정지용」을 막을 수 없다 — 그는 1950년
 *   사망으로 적혀 있고 북한 분류도 없어 `checkAuthor`를 그대로 통과한다.
 *   그를 막는 지식은 이 파일의 `BLOCKED_AUTHORS`에만 있다. 실측: 지금 표에
 *   정지용의 작품 3편(「백록담」·「정지용 시집」·「향수」)이 이 경로로 남아
 *   있다.
 * - **번역물은 이제 이 함수까지 오지 않는 것이 보통이다.** 번역물은 원저자가
 *   외국인인 경우가 대부분이라(예: 「전쟁과 평화」/레프 톨스토이)
 *   `wikisource-meta.ts`의 「해외 저자」 검사가 표 단계에서 이미 제외한다.
 *   그래서 293개 표에는 `translator`가 있는 행이 하나도 없다. 그래도 아래
 *   번역물 검사는 지우지 않는다 — 한국인이 이미 만료된 한국 저자의 작품을
 *   번역한 경우는 원저자 검사를 통과하므로 여전히 이 함수가 마지막
 *   방어선이다.
 *
 * **저자가 빈 행은 이제 이 함수에 오지 않는다** (개정 — 원래는 "저자가
 * 비어 있는 것은 가리는 사유가 아니다. 「강촌 (두보)」처럼 다른 틀을 쓰는
 * 문서(99개 중 1개)는 목록에 남고, 가져올 때 저자를 입력받는다"였다).
 * 저자는 사망 연도·국적·금지 명단 세 검사의 입구라, 저자를 모르면 셋 다
 * 판정할 수 없다 — 그래서 `scripts/sync-wikisource-works.mjs`가 저자를
 * 못 읽은 행을 표에 아예 담지 않는다(항목 이름 어휘를 넓힌 뒤로는
 * 「모비딕」 1건뿐). 그런 작품은 `/admin/books/import`에서 사람이 저자를
 * 입력하고, 그 입력에 이 파일의 `blockedAuthorReason`이 그대로 걸린다.
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
