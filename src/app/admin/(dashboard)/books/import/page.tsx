import type { Metadata } from "next";
import Link from "next/link";
import { AdminNotice } from "@/components/admin/admin-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importFromWikisource } from "./actions";

export const metadata: Metadata = { title: "위키문헌에서 가져오기" };

/**
 * ws-export는 EPUB을 요청 시점에 생성한다. 단편은 3초쯤이지만 하위 페이지가
 * 많은 장편은 수십 초가 걸린다. `maxDuration`을 여기 선언하지 않는 이유:
 * 플랜 상한보다 큰 값을 쓰면 Vercel 배포 자체가 실패하고, 60을 못박으면
 * Pro의 더 높은 기본값을 스스로 깎는다. 장편이 타임아웃하면 Pro에서
 * `export const maxDuration = 300`을 여기 추가하고, Hobby면 상한이 60초라
 * 올릴 수 없다 — 그 경우 `npm run seed` 경로로 처리한다.
 */

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function ImportBookPage({
  searchParams,
}: PageProps<"/admin/books/import">) {
  const sp = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">위키문헌에서 가져오기</h1>
        <p className="text-muted-foreground text-sm">
          본문(EPUB)을 받아 정리해 올리고 도서를 만듭니다. 소개·인용구·권리
          근거는 이어지는 수정 화면에서 채웁니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />

      <form action={importFromWikisource} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source">위키문헌 문서 주소 또는 제목 *</Label>
          <Input
            id="source"
            name="source"
            required
            placeholder="https://ko.wikisource.org/wiki/운수_좋은_날"
          />
          <p className="text-muted-foreground text-xs">
            주소를 붙여넣거나 문서 제목을 그대로 적습니다. 동명 문서가 있으면
            위키문헌 쪽 제목에 괄호가 붙습니다 — 「진달래꽃 (시집)」처럼 문서
            제목 그대로 넣으세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="author">저자 *</Label>
            <Input id="author" name="author" required placeholder="현진건" />
            <p className="text-muted-foreground text-xs">
              위키문헌 EPUB에는 저자 정보가 없어 직접 입력해야 합니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category">카테고리 *</Label>
            <Input
              id="category"
              name="category"
              required
              placeholder="소설 / 시 / 수필…"
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          저작권이 만료된 저작물만 등록합니다 — 저작자가 1962년 이전에 사망한
          경우입니다 (PRD §5.11). 월북·납북 작가와 저작권이 존속하는 작가는
          자동으로 거부됩니다.
        </p>

        <div className="flex gap-2">
          <Button type="submit" size="lg" className="min-h-11">
            가져오기
          </Button>
          <Button asChild variant="ghost" size="lg" className="min-h-11">
            <Link href="/admin/books">취소</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
