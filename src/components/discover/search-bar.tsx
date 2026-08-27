"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * 검색어는 URL에 둔다 (FRONTEND.md §4 — URL 상태).
 * 뒤로가기로 이전 검색이 복원되고, 결과 링크를 그대로 공유할 수 있다.
 */
export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("q") ?? "";

  function submit(formData: FormData) {
    const q = String(formData.get("q") ?? "").trim();
    router.push(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
  }

  return (
    <form action={submit} className="flex gap-2">
      <div className="relative flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          name="q"
          type="search"
          defaultValue={current}
          placeholder="도서, 저자, 채널 검색"
          aria-label="검색어"
          className="h-11 pl-9"
        />
      </div>

      {current ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="min-h-11 min-w-11"
          aria-label="검색 지우기"
          onClick={() => router.push("/discover")}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </form>
  );
}
