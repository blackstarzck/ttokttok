import { safeAdminPath } from '@ttokttok/shared/admin-path';
import { adminIdToEmail, isValidAdminId } from "@ttokttok/shared/admin-id";
import type { Metadata } from "next";
import { BrandLogo } from "@ttokttok/ui/brand-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAdminAccess } from "@/lib/admin-guard";
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";

export const metadata: Metadata = { title: "관리자 로그인" };

async function signIn(formData: FormData) {
  "use server";

  const adminId = String(formData.get("adminId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeAdminPath(formData.get("next"));

  // 형식이 아니면 adminIdToEmail이 던진다. 던지면 Next 에러 화면이 뜨는데,
  // 오타 하나에 그건 과하다 — 자격증명 오류와 같은 문구로 되돌린다.
  if (!isValidAdminId(adminId)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({
    email: adminIdToEmail(adminId),
    password,
  });

  if (error) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const { error, next } = await searchParams;

  // "이미 로그인했으면 로그인 화면을 건너뛴다"는 관리자에게만 맞는 말이다.
  // 이 판단이 미들웨어에 있던 동안에는 관리자 여부를 볼 수 없어 로그인만
  // 했으면 무조건 /admin으로 보냈고, 권한 없는 사용자는 어드민 레이아웃이 다시
  // 여기로 돌려보내 두 관문이 서로를 가리키는 무한 리다이렉트가 됐다.
  // (일반 사용자가 소셜 로그인 상태로 /admin을 열면 바로 재현됐다.)
  //
  // 권한 없는 로그인 사용자에게는 폼을 그대로 보여준다 — 이들에게 필요한
  // 건 로그아웃이 아니라 **관리자 계정으로 다시 로그인하는 것**이고,
  // 폼을 제출하면 세션이 그 계정으로 갈아 끼워진다.
  const access = await readAdminAccess();
  if (access?.isAdmin) redirect("/admin");

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BrandLogo priority />
          <span>관리자</span>
        </h1>
        <p className="text-muted-foreground text-sm">
          콘텐츠를 등록하려면 로그인하세요.
        </p>
      </header>

      <form action={signIn} className="flex flex-col gap-4">
        <input
          type="hidden"
          name="next"
          value={safeAdminPath(next)}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="adminId">아이디</Label>
          <Input
            id="adminId"
            name="adminId"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
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
            {/*
              forbidden은 "로그인은 됐지만 관리자가 아니다"라 원인이 다르다.
              같은 문구를 쓰면 관리자가 비밀번호를 계속 다시 치게 된다.
            */}
            {error === "forbidden"
              ? "이 계정에는 관리자 권한이 없습니다. 관리자 계정으로 로그인하세요."
              : "아이디 또는 비밀번호가 맞지 않습니다."}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="min-h-11">
          로그인
        </Button>
      </form>
    </div>
  );
}
