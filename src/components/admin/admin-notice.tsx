import { cn } from "@/lib/utils";

/**
 * 어드민 화면의 결과 알림. 서버 액션이 리다이렉트로 넘긴 쿼리를 그대로
 * 보여준다 — 토스트를 쓰려면 클라이언트 상태가 필요한데, 폼 제출마다
 * 페이지가 갈리는 어드민에서는 쿼리 쪽이 단순하다.
 */
export function AdminNotice({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (!error && !success) return null;

  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        error
          ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground",
      )}
    >
      {error ?? success}
    </p>
  );
}
