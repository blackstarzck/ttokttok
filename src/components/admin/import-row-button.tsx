"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * 목록 행의 「가져오기」 버튼.
 *
 * 클라이언트 컴포넌트인 이유는 `useFormStatus` 하나다. ws-export가 EPUB을
 * 요청 시점에 만들어 장편은 수십 초가 걸리는데, 표에 50행이 있으면 어느
 * 행이 일하는 중인지 보이지 않는다 — 관리자가 다시 누르면 4MB를 두 번
 * 받아 하나는 unique 인덱스에서 버려진다.
 *
 * `useFormStatus`는 폼 **안에** 있어야 상태를 읽는다.
 */
export function ImportRowButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" className="min-h-11" disabled={pending}>
      {pending ? "가져오는 중…" : "가져오기"}
    </Button>
  );
}
