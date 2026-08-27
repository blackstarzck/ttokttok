import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "관리자 로그인" };

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const { error, next } = await searchParams;

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">똑똑 관리자</h1>
        <p className="text-muted-foreground text-sm">
          콘텐츠를 등록하려면 로그인하세요.
        </p>
      </header>

      <form action={signIn} className="flex flex-col gap-4">
        <input
          type="hidden"
          name="next"
          value={typeof next === "string" ? next : "/admin"}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p className="text-destructive text-sm">
            이메일 또는 비밀번호가 맞지 않습니다.
          </p>
        ) : null}

        <Button type="submit" size="lg" className="min-h-11">
          로그인
        </Button>
      </form>
    </div>
  );
}
