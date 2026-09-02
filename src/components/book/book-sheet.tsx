"use client";

import { useState } from "react";
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
import { LoginSheet } from "@/components/auth/login-sheet";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { formatByline } from "@/lib/format";
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
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-muted-foreground w-14 shrink-0">{label}</dt>
      <dd className="break-keep">{value}</dd>
    </div>
  );
}

export function BookSheet({
  book,
  isGuest = true,
  children,
}: {
  book: FeedBook;
  isGuest?: boolean;
  children: React.ReactNode;
}) {
  const [bookmarking, setBookmarking] = useState(false);
  const isFullBook = book.epub_path !== null;
  const purchaseLinks = isFullBook ? [] : buildPurchaseLinks(book);

  const byline = formatByline(book);

  return (
    <Drawer
      onOpenChange={(open) => {
        // 링크형 깔때기의 가운데 단계 (PRD §11-32)
        if (open) void track("book_sheet_open", { bookId: book.id });
      }}
    >
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent>
        {/*
          text-left만으로는 안 먹는다 — DrawerHeader 기본값에
          group-data-[vaul-drawer-direction=bottom]:text-center가 있어서
          변형 선택자가 맨몸 유틸리티를 이긴다. 같은 변형으로 덮어써야
          tailwind-merge가 둘을 같은 그룹으로 보고 뒤엣것을 남긴다.
          커버가 왼쪽에 서는 가로 배치라 글줄도 왼쪽 기준이어야 한다.
        */}
        <DrawerHeader className="flex flex-row items-start gap-4 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
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

        {/*
          시트 본문은 3단이다 (PRD §5.12): ① 소개 ② 인용구 ③ 상세 정보.
          인용구·상세는 게시물 본문이 아니라 도서의 메타정보라서 여기 산다 —
          어떤 게시물에서 열어도 같은 도서면 같은 내용을 본다.
        */}
        <ScrollArea className="max-h-[40vh] px-4">
          <div className="flex flex-col gap-5 pb-4">
            {book.intro ? (
              <p className="text-sm leading-relaxed break-keep">{book.intro}</p>
            ) : null}

            {book.quote ? (
              <figure className="flex flex-col gap-2">
                {/* DESIGN.md quote 토큰: 20px · 500 · 행간 1.7 */}
                <blockquote className="text-xl leading-loose font-medium break-keep">
                  {book.quote}
                </blockquote>
                <figcaption className="text-muted-foreground text-xs">
                  <cite className="not-italic">
                    {book.quote_source ?? `${book.title} · ${book.author}`}
                  </cite>
                </figcaption>
              </figure>
            ) : null}

            <section className="flex flex-col gap-3">
              <h3 className="text-muted-foreground text-xs font-medium">
                상세 정보
              </h3>
              <dl className="flex flex-col gap-2">
                {book.publisher ? (
                  <DetailRow label="출판사" value={book.publisher} />
                ) : null}
                {book.page_count ? (
                  <DetailRow label="페이지" value={`${book.page_count}p`} />
                ) : null}
                {book.pub_date_paper ? (
                  <DetailRow label="출간일" value={book.pub_date_paper} />
                ) : null}
                {book.isbn ? (
                  <div className="flex gap-3 text-sm">
                    <dt className="text-muted-foreground w-14 shrink-0">ISBN</dt>
                    <dd className="font-mono">{book.isbn}</dd>
                  </div>
                ) : null}
              </dl>

              {book.toc.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h4 className="text-muted-foreground text-xs font-medium">
                    목차
                  </h4>
                  <ol className="flex flex-col gap-2">
                    {book.toc.map((item, i) => (
                      <li key={`${i}-${item}`} className="text-sm break-keep">
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
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
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        void track("purchase_link_click", {
                          bookId: book.id,
                          props: { store: key },
                        })
                      }
                    >
                      {label}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            {isGuest ? (
              <LoginSheet reason="로그인하면 보관함에 담을 수 있어요.">
                <Button variant="secondary" size="lg" className="min-h-11 flex-1">
                  <Bookmark aria-hidden />
                  찜하기
                </Button>
              </LoginSheet>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                className="min-h-11 flex-1"
                disabled={bookmarking}
                onClick={async () => {
                  setBookmarking(true);
                  const { error } = await createClient()
                    .from("bookmarks")
                    .upsert({ book_id: book.id });
                  setBookmarking(false);
                  if (error) {
                    toast.error("보관함에 담지 못했어요");
                    console.error("bookmark:", error.message);
                  } else {
                    toast.success("보관함에 담았어요");
                  }
                }}
              >
                <Bookmark aria-hidden />
                찜하기
              </Button>
            )}
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
