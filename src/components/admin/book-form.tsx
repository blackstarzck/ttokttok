import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBook } from "@/app/admin/(dashboard)/books/actions";

export type BookFormValues = {
  id: string;
  title: string;
  author: string;
  translator: string | null;
  publisher: string | null;
  category: string;
  isbn: string | null;
  page_count: number | null;
  pub_date_paper: string | null;
  pub_date_ebook: string | null;
  intro: string | null;
  toc: string[];
  source: string | null;
  rights_note: string | null;
  epub_path: string | null;
  cover_url: string | null;
  purchase_links: Record<string, string> | null;
};

function Field({
  name,
  label,
  defaultValue,
  ...rest
}: Omit<React.ComponentProps<typeof Input>, "defaultValue"> & {
  name: string;
  label: string;
  /** DB 값이 그대로 들어오도록 null을 허용한다 — 빈 문자열로 바꿔 넘긴다. */
  defaultValue?: string | number | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue ?? ""} {...rest} />
    </div>
  );
}

/**
 * 도서 등록/수정 폼 (PRD §5.10).
 * 서버 컴포넌트 — 파일 업로드를 포함해 전부 서버 액션이 처리한다.
 */
export function BookForm({ book }: { book?: BookFormValues }) {
  const links = book?.purchase_links ?? {};

  return (
    <form action={saveBook} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={book?.id ?? ""} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">서지 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="title" label="제목 *" defaultValue={book?.title} required />
          <Field name="author" label="저자 *" defaultValue={book?.author} required />
          <Field name="translator" label="옮긴이" defaultValue={book?.translator} />
          <Field name="publisher" label="출판사" defaultValue={book?.publisher} />
          <Field
            name="category"
            label="카테고리 *"
            defaultValue={book?.category}
            placeholder="소설 / 시 / 자기계발…"
            required
          />
          <Field name="isbn" label="ISBN" defaultValue={book?.isbn} />
          <Field
            name="page_count"
            label="페이지 수"
            type="number"
            defaultValue={book?.page_count}
          />
          <Field
            name="pub_date_paper"
            label="종이책 출간일"
            type="date"
            defaultValue={book?.pub_date_paper}
          />
          <Field
            name="pub_date_ebook"
            label="전자책 출간일"
            type="date"
            defaultValue={book?.pub_date_ebook}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="intro">소개</Label>
          <Textarea
            id="intro"
            name="intro"
            defaultValue={book?.intro ?? ""}
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="toc">목차</Label>
          <Textarea
            id="toc"
            name="toc"
            defaultValue={book?.toc.join("\n") ?? ""}
            rows={6}
            placeholder="한 줄에 하나씩"
          />
          <p className="text-muted-foreground text-xs">줄바꿈으로 구분합니다.</p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">본문과 표지</h2>
          <p className="text-muted-foreground text-xs">
            EPUB을 올리면 전문 도서가 되어 뷰어에서 열립니다. 올리지 않으면
            링크형 도서이며, ISBN이나 구매 링크 중 하나는 반드시 있어야
            저장됩니다.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="epub">EPUB 파일</Label>
            <Input id="epub" name="epub" type="file" accept=".epub" />
            <p className="text-muted-foreground text-xs">
              {book?.epub_path ? "현재: 업로드됨 (다시 올리면 교체)" : "현재: 없음"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cover">표지 이미지</Label>
            <Input id="cover" name="cover" type="file" accept="image/*" />
            <p className="text-muted-foreground text-xs">
              {book?.cover_url ? "현재: 있음 (다시 올리면 교체)" : "현재: 없음 — 타이포그래피로 표시됩니다"}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">구매 링크 (링크형 도서)</h2>
          <p className="text-muted-foreground text-xs">
            비워 두면 ISBN으로 각 서점 검색 URL을 자동 생성합니다. 특정 판본을
            가리키려면 여기에 직접 넣으세요.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="purchase_kyobo" label="교보문고" defaultValue={links.kyobo} />
          <Field name="purchase_yes24" label="예스24" defaultValue={links.yes24} />
          <Field name="purchase_aladin" label="알라딘" defaultValue={links.aladin} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">관리 정보</h2>
          <p className="text-muted-foreground text-xs">
            어디서 어떤 근거로 확보했는지 남깁니다 (PRD §5.11).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="source"
            label="수급 출처"
            defaultValue={book?.source}
            placeholder="wikisource / gongu / manual"
          />
          <Field
            name="rights_note"
            label="권리 근거"
            defaultValue={book?.rights_note}
            placeholder="현진건 1943년 사망 — 구법 사후 50년 만료"
          />
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" size="lg" className="min-h-11">
          저장
        </Button>
        <Button asChild variant="ghost" size="lg" className="min-h-11">
          <Link href="/admin/books">취소</Link>
        </Button>
      </div>
    </form>
  );
}
