import type { Metadata } from "next";
import Link from "next/link";
import { AdminNotice } from "@/components/admin/admin-notice";
import { ImportRowButton } from "@/components/admin/import-row-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  applyCatalogueQuery,
  buildCatalogueHref,
  decadeOptions,
  nextSortDir,
  pageTitlesToDisambiguate,
  parseCatalogueQuery,
  type CatalogueQuery,
  type SortKey,
  type WorkRow,
} from "@/lib/wikisource-catalogue";
import { SCOPE_GENRES, toBookCategory } from "@/lib/wikisource-meta";
import { importFromWikisource } from "../import/actions";

export const metadata: Metadata = { title: "위키문헌 작품 목록" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

type Row = WorkRow & { synced_at: string };

/**
 * 정렬 가능한 컬럼 머리.
 *
 * 현재 정렬 중인 컬럼에만 방향 화살표를 붙인다. 모든 컬럼에 붙이면
 * 무엇이 적용된 정렬인지 안 보인다.
 *
 * **탭 타깃은 헤더 칸 전체다** (2026-09-09 수정 — 예전엔 `inline-flex`
 * `Link`가 자기 줄상자만 차지해 「저자」·「장르」·「출간」이 26×20px밖에
 * 안 됐다). `TableHead`를 `p-0`으로 비우고 `Link`에 `flex h-11`을 줘서
 * 블록 레벨 박스가 되게 한다 — 표 셀 안의 블록 자식은 너비가 셀 전체로
 * 자동으로 채워지므로 별도로 `w-full`을 줄 필요가 없다. `h-11`(44px)이
 * `docs/DESIGN.md`의 터치 타깃 최소치를 채운다 — 그 문서가 명시한 예외는
 * `BottomNav` 하나뿐이고 다른 곳으로 넓히지 말라고 못박혀 있다.
 */
function SortableHead({
  label,
  sortKey,
  query,
  className,
}: {
  label: string;
  sortKey: SortKey;
  query: CatalogueQuery;
  className?: string;
}) {
  const active = query.sort === sortKey;
  const arrow = active ? (query.dir === "asc" ? " ↑" : " ↓") : "";
  const nextDir = nextSortDir(query, sortKey);

  return (
    <TableHead
      className={cn("h-11 p-0", className)}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={buildCatalogueHref(query, {
          sort: sortKey,
          dir: nextDir,
        })}
        className="hover:text-foreground flex h-11 items-center whitespace-nowrap px-2 underline-offset-4 hover:underline"
        aria-label={
          (active
            ? `${label}, 현재 ${query.dir === "asc" ? "오름차" : "내림차"} 정렬. `
            : `${label}. `) +
          `${nextDir === "asc" ? "오름차" : "내림차"} 정렬로 변경`
        }
      >
        {label}
        {arrow}
      </Link>
    </TableHead>
  );
}

export default async function WikisourceCataloguePage({
  searchParams,
}: PageProps<"/admin/books/wikisource">) {
  const sp = await searchParams;
  const query = parseCatalogueQuery(sp);
  const db = await createClient();

  // 후보 전체(실측 293행, 2026-09-09)와 등록된 위키문헌 도서를 함께 받는다. 검색·필터·
  // 정렬·페이지는 wikisource-catalogue.ts의 순수 함수가 처리한다 — 그 파일
  // 머리말에 SQL로 밀지 않은 이유가 있다.
  const [works, books] = await Promise.all([
    db
      .from("wikisource_works")
      .select("page_title, title, author, genre, pub_year, translator, synced_at"),
    db
      .from("books")
      .select("id, source_ref")
      .eq("source", "wikisource")
      .not("source_ref", "is", null),
  ]);

  // 삼키면 실패가 빈 목록이 되어 "후보가 없다"와 구분되지 않는다.
  // 관용구는 books/page.tsx 참고 — 어드민 내부 화면이라 별도 에러 UI 없이
  // 던지고, 메시지는 서버 로그에서 본다.
  if (works.error) throw new Error(works.error.message);
  if (books.error) throw new Error(books.error.message);

  // 이 클라이언트는 Database 제네릭이 없어(src/lib/supabase/server.ts)
  // `select()` 결과의 타입이 스키마에서 나오지 않는다. `unknown`을 거쳐
  // `Row`로 좁히는 것은 컴파일러에게 진짜라고 속이는 캐스트가 아니라, "이
  // 컬럼을 쓰는 필자는 동기화 스크립트뿐이고 그 스크립트는 SCOPE_GENRES의
  // 값만 넣는다"는 운영 불변식(wikisource_works 마이그레이션 주석 참고)을
  // 코드로 적어 두는 것이다 — DB 컬럼 자체는 `genre text`일 뿐이다.
  const rows = (works.data ?? []) as unknown as Row[];

  // books.source_ref와 wikisource_works.page_title은 같은 정규화를 거친
  // 형식이다 (src/lib/wikisource.ts의 toPageTitle). 그래서 그냥 짝지어진다.
  const registered = new Map(
    (books.data ?? []).map((b) => [b.source_ref as string, b.id as string]),
  );

  const result = applyCatalogueQuery(rows, query, registered);

  // 페이지네이션 **이후**의 행만 넘긴다 — 다른 쪽에 있는 동명 작품과는
  // 같은 화면에 없으므로 괄호로 구별할 필요가 없다.
  const pageTitlesShown = pageTitlesToDisambiguate(result.rows);

  // 필터 전 전체 행에서 만든다 — 필터를 걸면 선택지가 사라져 되돌릴 수
  // 없게 되는 것을 막는다.
  const { decades, hasNoYear } = decadeOptions(rows);

  // 언제 기준의 목록인지 — 목록은 동기화 시점의 스냅숏이다. 문자열을 그대로
  // 비교하지 않고 Date로 바꿔 비교한다 — timestamptz 직렬화가 초 단위 자릿수를
  // 생략할 수 있어(예: `...:00+00:00` vs `...:00.5+00:00`) 문자열 비교가
  // 우연히 맞는 경우에 기대는 대신, 실제 시각으로 비교해 확실히 한다.
  const syncedAt = rows.reduce<string | null>(
    (latest, r) =>
      !latest || new Date(r.synced_at).getTime() > new Date(latest).getTime()
        ? r.synced_at
        : latest,
    null,
  );

  return (
    <div className="flex flex-col gap-6">
      {/*
        375px에서 버튼이 제목 열을 짓누르지 않게 sm 미만은 세로로 쌓고
        min-w-0으로 제목 블록이 실제로 줄어들 수 있게 한다 — books/page.tsx와
        같은 관용구다.
      */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-bold">위키문헌 작품 목록</h1>
          <p className="text-muted-foreground text-sm">
            가져올 수 있는 소설·시집입니다. 저자와 분류가 이미 채워져 있어
            바로 가져올 수 있습니다.
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 shrink-0">
          <Link href="/admin/books/import">주소로 직접 가져오기</Link>
        </Button>
      </header>

      <AdminNotice error={q(sp.error)} />

      {/*
        method="get"이라 제출하면 값이 그대로 주소가 된다 — 상태가 주소에
        있으므로(FRONTEND.md §4) 클라이언트 컴포넌트가 필요 없다.

        정렬은 이 폼에 없고 헤더 링크가 담당한다. 그래서 숨은 필드로 물고
        가야 한다 — 없으면 검색할 때마다 정렬이 기본값으로 돌아간다.
        쪽 번호는 일부러 넣지 않는다: 필터가 바뀌면 1쪽에서 다시 봐야 한다.
      */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        {query.sort !== "title" && (
          <input type="hidden" name="sort" value={query.sort} />
        )}
        {query.dir !== "asc" && <input type="hidden" name="dir" value={query.dir} />}

        <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-48">
          <Label htmlFor="q" className="text-xs">
            검색
          </Label>
          <Input
            id="q"
            name="q"
            defaultValue={query.q}
            placeholder="작품명 또는 저자"
            className="min-h-11"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="genre" className="text-xs">
            장르
          </Label>
          <select
            id="genre"
            name="genre"
            defaultValue={query.genre ?? ""}
            className="border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">전체</option>
            {SCOPE_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="decade" className="text-xs">
            출간
          </Label>
          <select
            id="decade"
            name="decade"
            defaultValue={query.noYear ? "none" : (query.decade?.toString() ?? "")}
            className="border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">전체</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}년대
              </option>
            ))}
            {hasNoYear && <option value="none">연도 없음</option>}
          </select>
        </div>

        <Button type="submit" variant="secondary" className="min-h-11">
          적용
        </Button>

        {/*
          체크박스는 자바스크립트 없이 켜면 value가 실려 나가고 끄면 아예
          안 실린다 — parseCatalogueQuery가 `1`일 때만 켜진 것으로 읽는
          이유가 이것이다.
        */}
        <div className="flex basis-full flex-col gap-2 sm:basis-auto">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hide"
              value="1"
              defaultChecked={query.hideRegistered}
              className="size-4"
            />
            등록된 것 숨기기
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all"
              value="1"
              defaultChecked={query.showUnlistable}
              className="size-4"
            />
            등록 불가 포함해서 보기
          </label>
        </div>

        {/*
          필터가 걸려 있을 때만 초기화를 보여준다. 항상 있으면 누를 이유가
          없는 버튼이 자리만 차지한다.
        */}
        {(query.q ||
          query.genre ||
          query.decade !== null ||
          query.noYear ||
          query.hideRegistered ||
          query.showUnlistable) && (
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/admin/books/wikisource">초기화</Link>
          </Button>
        )}
      </form>

      {/*
        목록에 없는 작품이 있다는 사실을 화면에 적는다. 범위를 소설 계열·
        시집으로 좁혔으므로 「홍염」처럼 위키문헌에 장르가 없는 작품, 수필·
        시 낱편, PD 태그 없는 문서는 여기 없다 — 그걸 모르면 관리자는
        "위키문헌에 없는 작품"으로 오해한다.
      */}
      <p className="text-muted-foreground text-xs">
        총 {result.total.toLocaleString()}편
        {syncedAt && ` · ${new Date(syncedAt).toLocaleDateString("ko-KR")} 기준`}
        {" · 목록에 없는 작품은 "}
        <Link href="/admin/books/import" className="underline">
          주소로 직접
        </Link>
        {" 가져옵니다."}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="작품명" sortKey="title" query={query} />
            <SortableHead label="저자" sortKey="author" query={query} />
            <SortableHead label="장르" sortKey="genre" query={query} />
            <SortableHead label="출간" sortKey="year" query={query} />
            <TableHead className="text-right">상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.length ? (
            result.rows.map((row) => (
              <TableRow
                key={row.page_title}
                className={row.blockedReason ? "opacity-60" : undefined}
              >
                <TableCell className="font-medium break-keep">
                  {row.title}
                  {/*
                    표시 제목과 문서 제목이 다른 경우가 있다 —
                    「진달래꽃」의 문서는 「진달래꽃 (시집)」이다. 하지만
                    표시 제목에는 대개 한자 병기가 이미 붙어 있어서
                    (「그날이 오면」 → 「(詩歌隨筆) 그날이 오면」), 겹치는
                    행이 없을 때도 무조건 붙이면 「(詩歌隨筆) 그날이
                    오면(그날이 오면)」처럼 잡음만 된다. 그래서 같은 쪽에
                    보이는 다른 행과 표시 제목이 겹칠 때만 보여준다
                    (pageTitlesToDisambiguate, wikisource-catalogue.ts) —
                    그래야 「진달래꽃」처럼 정말 동명 작품을 구별해야 하는
                    경우에만 나타난다.
                  */}
                  {pageTitlesShown.has(row.page_title) && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({row.page_title})
                    </span>
                  )}
                </TableCell>
                <TableCell className="break-keep">{row.author ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.genre}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.pub_year ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {row.blockedReason ? (
                      <span className="text-muted-foreground text-xs break-keep">
                        {row.blockedReason}
                      </span>
                    ) : row.bookId ? (
                      <Button asChild variant="ghost" size="sm" className="min-h-11">
                        <Link href={`/admin/books/${row.bookId}`}>✓ 등록됨</Link>
                      </Button>
                    ) : row.author ? (
                      <form action={importFromWikisource}>
                        <input type="hidden" name="source" value={row.page_title} />
                        <input type="hidden" name="author" value={row.author} />
                        <input
                          type="hidden"
                          name="category"
                          value={toBookCategory(row.genre)}
                        />
                        {/* 오류가 나면 임포트 화면이 아니라 이 목록으로 돌아온다. */}
                        <input type="hidden" name="from" value="catalogue" />
                        <ImportRowButton />
                      </form>
                    ) : (
                      /*
                        이 분기는 스키마가 author를 nullable로 두어서
                        남겨 둔 방어 코드다 — 지금 293개 표에는 저자가
                        빈 행이 실제로 없다(동기화가 저자를 못 읽은 문서를
                        아예 담지 않는다, 개정 2026-09-09). 혹시라도
                        이런 행이 나타나면 임포트 화면으로 보내 저자를
                        입력받는다.
                      */
                      <Button asChild variant="secondary" size="sm" className="min-h-11">
                        <Link
                          href={`/admin/books/import?source=${encodeURIComponent(
                            row.page_title,
                          )}&category=${encodeURIComponent(toBookCategory(row.genre))}`}
                        >
                          저자 입력 후
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                {rows.length
                  ? "조건에 맞는 작품이 없습니다."
                  : "후보가 없습니다. npm run wikisource:sync 를 먼저 돌립니다."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/*
        293행이 50개씩 6쪽으로 잘린다(applyCatalogueQuery의 PAGE_SIZE). 이전/
        다음만 두고 쪽 번호 목록은 두지 않는다 — Task 7이 필터 UI를 얹으면
        쪽 이동은 대개 필터를 좁힌 뒤라 몇 쪽 안 남는다. `buildCatalogueHref`로
        만들어 현재 검색·필터·정렬을 유지한 채 쪽만 바꾼다.

        비활성 상태는 `asChild`로 `Link`를 감싸지 않는다 — `disabled`를
        `Slot`을 통해 `<a>`에 넘기면 DOM에 유효하지 않은 속성으로 얹힐 뿐
        클릭을 막지 못한다. 그래서 비활성일 때는 `asChild` 없이 실제
        `<button disabled>`를 렌더링한다.
      */}
      {result.pageCount > 1 && (
        <nav aria-label="페이지" className="flex items-center justify-between gap-2">
          {result.page > 1 ? (
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link href={buildCatalogueHref(query, { page: result.page - 1 })}>
                이전
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="min-h-11" disabled>
              이전
            </Button>
          )}

          <p className="text-muted-foreground text-xs">
            {result.page} / {result.pageCount}쪽
          </p>

          {result.page < result.pageCount ? (
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link href={buildCatalogueHref(query, { page: result.page + 1 })}>
                다음
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="min-h-11" disabled>
              다음
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
