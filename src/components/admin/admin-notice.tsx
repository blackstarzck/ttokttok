import { cn } from "@/lib/utils";

/**
 * 어드민의 오류 알림.
 *
 * 오류는 관리자가 고칠 때까지 화면에 남아야 하므로 배너로 둔다. 성공은
 * 읽고 나면 할 일이 없어 토스트로 뺐다 — AdminToast 참고.
 */
export function AdminNotice({ error }: { error?: string }) {
  if (!error) return null;

  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        "border-destructive/40 text-destructive",
      )}
    >
      {error}
    </p>
  );
}
