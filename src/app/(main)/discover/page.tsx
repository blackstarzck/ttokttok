import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { SearchBar } from "@/components/discover/search-bar";
import { BookGrid } from "@/components/discover/book-grid";
import { formatCount } from "@/lib/format";
import {
  getBooksByCategory,
  getCategories,
  getFeaturedBooks,
  getTrendingPosts,
  search,
} from "@/lib/discover";

export const metadata: Metadata = { title: "탐색" };

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

async function SearchResults({ query }: { query: string }) {
  const { books, channels } = await search(query);

  if (books.length === 0 && channels.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        “{query}”에 대한 결과가 없어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {channels.length > 0 ? (
        <Section title="채널">
          <ul className="flex flex-col">
            {channels.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/channel/${c.slug}`}
                  className="hover:bg-accent focus-visible:ring-ring flex min-h-14 items-center gap-3 rounded-md px-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs">
                      {c.name.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{c.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {c.genre}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {books.length > 0 ? (
        <Section title="도서">
          <BookGrid books={books} />
        </Section>
      ) : null}
    </div>
  );
}

async function CategoryResults({ category }: { category: string }) {
  const books = await getBooksByCategory(category);
  return books.length ? (
    <BookGrid books={books} />
  ) : (
    <p className="text-muted-foreground py-10 text-center text-sm">
      이 분야에는 아직 도서가 없어요.
    </p>
  );
}

async function Browse({ category }: { category?: string }) {
  const [featured, categories, trending] = await Promise.all([
    getFeaturedBooks(),
    getCategories(),
    getTrendingPosts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {!category && featured.length > 0 ? (
        <Section title="오늘의 추천">
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.map((book) => (
              <li key={book.id} className="w-32 shrink-0">
                <BookSheet book={book}>
                  <button
                    type="button"
                    className="focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <BookCover book={book} className="w-full" />
                    <span className="line-clamp-2 text-xs leading-snug break-keep">
                      {book.title}
                    </span>
                  </button>
                </BookSheet>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {categories.length > 0 ? (
        <Section title="관심 분야">
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = c === category;
              return (
                <li key={c}>
                  <Link
                    href={active ? "/discover" : `/discover?category=${encodeURIComponent(c)}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Badge
                      variant={active ? "default" : "secondary"}
                      className="min-h-9 px-3"
                    >
                      {c}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {category ? (
        <Section title={`${category} 도서`}>
          <CategoryResults category={category} />
        </Section>
      ) : trending.length > 0 ? (
        <Section title="급상승">
          <ul className="grid grid-cols-3 gap-1">
            {trending.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/p/${post.id}`}
                  className="focus-visible:ring-ring relative block rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <BookCover book={post.books} className="w-full" />
                  <span className="text-muted-foreground mt-1 block truncate px-0.5 text-xs">
                    {formatCount(post.view_count)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full" />
      ))}
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: PageProps<"/discover">) {
  const sp = await searchParams;
  const query = one(sp.q)?.trim();
  const category = one(sp.category);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <SearchBar />

      <Suspense key={query ?? category ?? "browse"} fallback={<GridSkeleton />}>
        {query ? (
          <SearchResults query={query} />
        ) : (
          <Browse category={category} />
        )}
      </Suspense>
    </div>
  );
}
