"use client";

import Link from "next/link";
import { BookOpen, Bookmark, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookCover } from "@/components/feed/book-cover";
import { buildPurchaseLinks } from "@/lib/purchase-links";
import type { FeedBook } from "@/lib/feed";

/**
 * 도서 상세 시트 (PRD §5.12).
 *
 * 도서의 정식 상세 화면은 별도 페이지 없이 이 바텀시트 하나로 통일한다.
 * 진입점(피드 하단 바 · 카드 [더보기] · 링크형 CTA · 검색 결과 · 보관함)이
 * 전부 같은 시트를 연다.
 *
 * 여는 방법은 트리거를 children으로 받는 조합이다 — 진입점마다 생김새가
 * 다르므로 prop으로 모양을 분기하지 않는다 (FRONTEND.md §2).
 */
export function BookSheet({
  book,
  children,
}: {
  book: FeedBook;
  children: React.ReactNode;
}) {
  const isFullBook = book.epub_path !== null;
  const purchaseLinks = isFullBook ? [] : buildPurchaseLinks(book);

  const byline = [
    book.author,
    book.translator ? `${book.translator} 옮김` : null,
    book.publisher,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="flex flex-row items-start gap-4 text-left">
          <BookCover book={book} className="w-24 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {book.category}
            </span>
            <DrawerTitle className="text-lg leading-snug break-keep">
              {book.title}
            </DrawerTitle>
            <DrawerDescription className="text-xs break-keep">
              {byline}
            </DrawerDescription>
          </div>
        </DrawerHeader>

        <ScrollArea className="max-h-[40vh] px-4">
          <div className="flex flex-col gap-5 pb-4">
            {book.intro ? (
              <p className="text-sm leading-relaxed break-keep">{book.intro}</p>
            ) : null}

            {book.toc.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-medium">
                  목차
                </h3>
                <ol className="flex flex-col gap-2">
                  {book.toc.map((item, i) => (
                    <li key={`${i}-${item}`} className="text-sm break-keep">
                      {item}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {book.isbn ? (
              <p className="text-muted-foreground text-xs">
                ISBN <span className="font-mono">{book.isbn}</span>
              </p>
            ) : null}
          </div>
        </ScrollArea>

        <DrawerFooter className="gap-2">
          {isFullBook ? (
            <Button asChild size="lg" className="min-h-11 w-full">
              <Link href={`/read/${book.id}`}>
                <BookOpen aria-hidden />
                바로 읽기
              </Link>
            </Button>
          ) : purchaseLinks.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                서점에서 만나보세요
              </p>
              <div className="grid grid-cols-3 gap-2">
                {purchaseLinks.map(({ key, label, url }) => (
                  <Button
                    key={key}
                    asChild
                    variant="secondary"
                    size="lg"
                    className="min-h-11"
                  >
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {label}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="min-h-11 flex-1"
              onClick={() => toast("로그인하면 보관함에 담을 수 있어요")}
            >
              <Bookmark aria-hidden />
              찜하기
            </Button>
            <DrawerClose asChild>
              <Button variant="ghost" size="lg" className="min-h-11">
                닫기
              </Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
