import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SocialButtons } from "@/components/auth/social-buttons";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "로그인" };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "로그인이 완료되지 않았어요. 다시 시도해 주세요.",
  exchange_failed: "로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.",
  access_denied: "로그인을 취소하셨어요.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { error, next } = await searchParams;

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  // 이미 로그인했으면 머물 이유가 없다.
  if (user) redirect(typeof next === "string" ? next : "/");

  const message =
    typeof error === "string"
      ? (ERROR_MESSAGES[error] ?? "로그인에 실패했어요. 다시 시도해 주세요.")
      : null;

  return (
    <div className="flex h-full flex-col justify-center gap-8 px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold break-keep">
          지식이 똑똑 노크해요
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed break-keep">
          로그인하면 읽은 기록이 기기 사이에서 이어지고, 좋아요와 댓글을
          남길 수 있어요.
        </p>
      </header>

      {message ? <p className="text-destructive text-sm">{message}</p> : null}

      <SocialButtons next={typeof next === "string" ? next : undefined} />

      <p className="text-muted-foreground text-center text-xs">
        로그인 없이도 피드와 읽기는 그대로 쓸 수 있어요.
      </p>
    </div>
  );
}
