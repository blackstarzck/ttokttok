import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { timeAgo } from "@/lib/comments";
import {
  addBannedWord,
  deleteReportedComment,
  dismissReport,
  removeBannedWord,
} from "./actions";

export const metadata: Metadata = { title: "신고 처리" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

const REASON_LABEL: Record<string, string> = {
  spam: "스팸·광고",
  abuse: "욕설·비방",
  etc: "기타",
};

const DONE_MESSAGE: Record<string, string> = {
  deleted: "댓글을 삭제했습니다.",
  dismissed: "신고를 기각했습니다.",
  word_added: "금칙어를 추가했습니다.",
  word_removed: "금칙어를 삭제했습니다.",
};

export default async function AdminReportsPage({
  searchParams,
}: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const db = await createClient();

  const [{ data: reports, error: reportsError }, { data: words }] =
    await Promise.all([
      db
        .from("reports")
        .select(
          // comment_likes가 comments-profiles 관계를 두 경로로 갈라놓아
          // (src/lib/comments.ts COMMENT_SELECT 주석 참고) profiles를
          // FK 없이 그냥 embed하면 PostgREST가 300 + PGRST201로 거부한다.
          // 여기서 다시 벗겨내지 말 것.
          "id, reason, status, created_at, comment_id, comments ( content, deleted_at, profiles!comments_user_id_fkey ( nickname ) )",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      db.from("banned_words").select("id, word").order("word"),
    ]);

  // 이 임베드는 실제로 300(PGRST201)을 반환한 적이 있다 — 조용히 삼키면
  // reports가 null이 되어 아래 루프가 0번 돌고, 관리자는 "신고 없음"과
  // 구분할 수 없다. src/app에 error.tsx가 없어 다음 렌더에서 던지면
  // Next 기본 에러 화면(프로덕션에서는 메시지가 가려지고 digest만 남는다)이
  // 뜨는데, 그것만으로도 "신고 없음"과는 구분된다 — 메시지 자체는
  // 서버 로그에서 확인한다. 내부 어드민 화면이라 별도 에러 UI 없이 던진다.
  if (reportsError) throw new Error(reportsError.message);

  // 같은 댓글에 여러 신고가 붙는다 — 댓글 단위로 묶어 한 번에 처리한다.
  const grouped = new Map<
    string,
    {
      commentId: string;
      content: string;
      nickname: string;
      deleted: boolean;
      reasons: string[];
      latest: string;
    }
  >();

  for (const r of reports ?? []) {
    const c = r.comments as unknown as {
      content: string;
      deleted_at: string | null;
      profiles: { nickname: string } | null;
    } | null;
    if (!c) continue;

    const existing = grouped.get(r.comment_id);
    if (existing) {
      existing.reasons.push(r.reason);
    } else {
      grouped.set(r.comment_id, {
        commentId: r.comment_id,
        content: c.content,
        nickname: c.profiles?.nickname ?? "독자",
        deleted: c.deleted_at !== null,
        reasons: [r.reason],
        latest: r.created_at,
      });
    }
  }

  const queue = [...grouped.values()];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">신고 처리</h1>
          <p className="text-muted-foreground text-sm">
            처리하지 않은 신고 {queue.length}건입니다.
          </p>
        </header>

        <AdminNotice error={q(sp.error)} />
        <AdminToast message={q(sp.done) ? DONE_MESSAGE[q(sp.done)!] : undefined} />

        {queue.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-lg border py-10 text-center text-sm">
            처리할 신고가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {queue.map((item) => (
              <li
                key={item.commentId}
                className="border-border flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.nickname}</span>
                  <span className="text-muted-foreground text-xs">
                    {timeAgo(item.latest)}
                  </span>
                  {item.reasons.map((r, i) => (
                    <Badge key={`${r}-${i}`} variant="secondary">
                      {REASON_LABEL[r] ?? r}
                    </Badge>
                  ))}
                  {item.deleted ? <Badge>이미 삭제됨</Badge> : null}
                </div>

                <p className="bg-card rounded-md p-3 text-sm leading-relaxed break-keep whitespace-pre-wrap">
                  {item.content}
                </p>

                <div className="flex gap-2">
                  {item.deleted ? null : (
                    <ConfirmDelete
                      action={deleteReportedComment}
                      hidden={{ comment_id: item.commentId }}
                      label="댓글 삭제"
                      size="default"
                      message="이 댓글을 삭제할까요? 이 댓글에 달린 신고도 함께 처리됩니다."
                    />
                  )}
                  <form action={dismissReport}>
                    <input
                      type="hidden"
                      name="comment_id"
                      value={item.commentId}
                    />
                    <Button type="submit" variant="ghost" className="min-h-11">
                      기각
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">금칙어</h2>
          <p className="text-muted-foreground text-sm">
            댓글 등록 시점에 검사해 차단합니다. 부분 일치입니다.
          </p>
        </header>

        <form action={addBannedWord} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="word">단어 추가</Label>
            <Input id="word" name="word" required />
          </div>
          <Button type="submit" className="min-h-11">
            추가
          </Button>
        </form>

        {words?.length ? (
          <ul className="flex flex-wrap gap-2">
            {words.map((w) => (
              <li key={w.id}>
                <ConfirmDelete
                  action={removeBannedWord}
                  hidden={{ id: w.id }}
                  label={`${w.word} ×`}
                  message={`금칙어 "${w.word}"을(를) 목록에서 뺄까요?`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">등록된 금칙어가 없습니다.</p>
        )}
      </section>
    </div>
  );
}
