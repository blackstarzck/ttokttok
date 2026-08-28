import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { SocialButtons } from "@/components/auth/social-buttons";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getBookmarks, getReadingProgress, type ReadingItem } from "@/lib/library";
import type { FeedBook } from "@/lib/feed";

export const metadata: Metadata = { title: "프로필" };

function Empty({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground py-10 text-center text-sm">{text}</p>
  );
}

/** 학습 중·완독 — 커버 + 진행률 바 (PRD §5.7). */
function ReadingList({ items }: { items: ReadingItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ book, percent }) => (
        <li key={book.id}>
          <Link
            href={`/read/${book.id}`}
            className="hover:bg-accent focus-visible:ring-ring flex items-center gap-3 rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <BookCover book={book} className="w-14 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-sm font-medium break-keep">
                {book.title}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {book.author}
              </span>
              <Progress value={percent} className="h-1" />
              <span className="text-muted-foreground text-xs tabular-nums">
                {Math.round(percent)}%
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 보관함 — 탭하면 도서 상세 시트 (PRD §5.7). */
function BookmarkGrid({ books }: { books: FeedBook[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3">
      {books.map((book) => (
        <li key={book.id}>
          <BookSheet book={book} isGuest={false}>
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
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();

  // 비로그인은 로그인 유도 화면 (PRD §5.7).
  if (!user) {
    return (
      <div className="flex h-full flex-col justify-center gap-8 px-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold break-keep">
            읽은 기록을 남겨보세요
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed break-keep">
            로그인하면 어디까지 읽었는지, 무엇을 찜했는지 기기가 바뀌어도
            이어집니다.
          </p>
        </header>
        <SocialButtons next="/profile" />

        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium">화면 테마</h2>
          <ThemeToggle />
        </section>
      </div>
    );
  }

  const [{ reading, finished }, bookmarks] = await Promise.all([
    getReadingProgress(),
    getBookmarks(),
  ]);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <header className="flex items-center gap-3">
        <Avatar className="size-14 shrink-0">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{user.nickname.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-lg font-bold">{user.nickname}</span>
          <span className="text-muted-foreground text-xs">
            완독 {finished.length}권 · 읽는 중 {reading.length}권
          </span>
        </div>

        {user.role === "admin" ? (
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <Link href="/admin">관리자</Link>
          </Button>
        ) : null}
        <SignOutButton />
      </header>

      <Tabs defaultValue="reading" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="reading" className="flex-1">
            학습 중
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="flex-1">
            보관함
          </TabsTrigger>
          <TabsTrigger value="finished" className="flex-1">
            완독
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reading">
          {reading.length ? (
            <ReadingList items={reading} />
          ) : (
            <Empty text="아직 읽기 시작한 책이 없어요." />
          )}
        </TabsContent>

        <TabsContent value="bookmarks">
          {bookmarks.length ? (
            <BookmarkGrid books={bookmarks} />
          ) : (
            <Empty text="찜한 책이 없어요." />
          )}
        </TabsContent>

        <TabsContent value="finished">
          {finished.length ? (
            <ReadingList items={finished} />
          ) : (
            <Empty text="아직 완독한 책이 없어요." />
          )}
        </TabsContent>
      </Tabs>

      <section className="flex shrink-0 flex-col gap-2 pt-2">
        <h2 className="text-muted-foreground text-xs font-medium">화면 테마</h2>
        <ThemeToggle />
      </section>
    </div>
  );
}
