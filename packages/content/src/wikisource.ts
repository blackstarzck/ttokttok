import { stripEpub } from '@ttokttok/shared/wikisource';

const WS_EXPORT = 'https://ws-export.wmcloud.org/';
const USER_AGENT = 'ttokttok/0.1 (https://github.com/ttokttok; content sourcing)';

export async function fetchEpub(pageTitle: string): Promise<Uint8Array> {
  const url = `${WS_EXPORT}?format=epub&lang=ko&page=${encodeURIComponent(pageTitle)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    console.error(`ws-export HTTP ${res.status} — ${url}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」을 받지 못했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/epub/i.test(contentType)) {
    // ws-export는 문서를 못 찾으면 영문 HTML을 준다. 그 원문을 관리자
    // 화면에 그대로 띄우면 읽고 할 수 있는 일이 없다 — 로그로만 남긴다.
    const body = (await res.text()).slice(0, 500).replace(/\s+/g, " ");
    console.error(`ws-export가 EPUB이 아닌 응답을 줬다 (${pageTitle}): ${body}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」 문서를 찾지 못했습니다. 주소를 확인해 주세요.`,
    );
  }

  return stripEpub(new Uint8Array(await res.arrayBuffer()));
}
