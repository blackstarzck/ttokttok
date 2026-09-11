import type { Metadata } from "next";
import { emailToAdminId } from "@ttokttok/shared/admin-id";
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ttokttok/ui/components/table";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import { requireOwner } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminAccount, setAdminActive, setAdminLevel } from "./actions";

export const metadata: Metadata = { title: "관리자 계정" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminAccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  const sp = await searchParams;
  const { userId } = await requireOwner();

  const db = await createClient();
  const { data: accounts, error } = await db
    .from("admin_accounts")
    .select("id, name, level, is_active, created_at, created_by")
    .order("created_at");

  // 삼키면 실패가 빈 목록이 되어 "관리자가 나뿐"으로 읽힌다 (결정 기록 §11-61).
  if (error) throw new Error(error.message);

  // 로그인 ID와 마지막 로그인은 auth.users가 원천이다 — 복제하지 않고 여기서
  // 붙인다 (설계 §5). listUsers()는 auth.users 전부를 반환한다 — 관리자가
  // 아니라 서비스 전체 독자다. 독자가 한 페이지(perPage)를 넘으면 관리자가
  // 그 밖으로 밀려나 로그인 ID·마지막 로그인이 "모른다"로 잘못 그려지고,
  // 매 렌더마다 전체 독자 이메일을 끌어오게 된다. 관리자 수는 한 자릿수이니
  // admin_accounts 행마다 id로 직접 조회한다 — 목록을 받지 않으니 둘 다
  // 없다.
  const adminClient = createAdminClient();
  const authResults = await Promise.all(
    accounts.map((a) => adminClient.auth.admin.getUserById(a.id)),
  );

  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = accounts.map((a, i) => {
    const { data, error: authRowError } = authResults[i];
    // 관리자 한 명의 auth.users 조회가 실패했다고 목록 전체를 막지 않는다
    // — admin_accounts 행(이름·등급·활성)은 이미 손에 있고 나머지 행은
    // 멀쩡하다. 다만 이 칸이 "기록 없음"·"—"처럼 아는 척하면 화면이
    // 거짓말을 하게 되므로, 실패는 구분되는 값으로 보여주고 콘솔에도
    // 남긴다 — 삼키는 것과는 다르다 (결정 기록 §11-61: 어드민은 삼키지
    // 않는다. 전체를 throw하는 대신 실패를 정직하게 드러내는 쪽을 골랐다).
    if (authRowError) {
      console.error(
        `관리자 auth 조회 실패 (id=${a.id}): ${authRowError.message}`,
      );
    }
    const authUser = data?.user;
    // emailToAdminId는 합성 이메일(@ttokttok.local)이 아니면 전부 null을
    // 준다 — "모른다"(auth 조회 실패)와 "이메일은 있는데 합성이 아니다"가
    // 같은 글자가 되면 안 된다. 후자는 배포 과도기의 브리지 행(결정 기록
    // §11-69, docs/superpowers/plans/2026-09-11-admin-accounts.md 「프로덕션
    // 배포 순서」)처럼 이 브랜치가 없애려는 바로 그 위험 신원이므로 화면에서
    // 눈에 띄어야 한다.
    const adminId = emailToAdminId(authUser?.email);
    return {
      ...a,
      loginId: authRowError
        ? "조회 실패"
        : (adminId ?? (authUser?.email ? `⚠ ${authUser.email}` : "—")),
      lastSignInAt: authRowError ? null : (authUser?.last_sign_in_at ?? null),
      authFetchFailed: Boolean(authRowError),
      createdByName: a.created_by ? (nameById.get(a.created_by) ?? "—") : "—",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">관리자 계정</h1>
        <p className="text-muted-foreground text-sm">
          어드민에 접근할 수 있는 계정입니다. owner만 이 화면을 볼 수 있습니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={
          q(sp.saved)
            ? "저장했습니다."
            : q(sp.disabled)
              ? "계정을 비활성화했습니다."
              : q(sp.enabled)
                ? "계정을 다시 활성화했습니다."
                : undefined
        }
      />

      <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">관리자 추가</h2>
        <form action={createAdminAccount} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adminId">아이디</Label>
            <Input
              id="adminId"
              name="adminId"
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ttokttok.editor"
              required
            />
            <p className="text-muted-foreground text-xs">
              소문자·숫자로 시작하는 3~32자. 점·하이픈·밑줄을 쓸 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">이름</Label>
            <Input id="name" name="name" type="text" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="level">등급</Label>
            <select
              id="level"
              name="level"
              defaultValue="admin"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="admin">admin — 콘텐츠 업무</option>
              <option value="owner">owner — 관리자 계정까지 관리</option>
            </select>
          </div>

          <Button type="submit" className="min-h-11 self-start">
            추가
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">목록</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>아이디</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>등급</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막 로그인</TableHead>
                <TableHead>추가한 사람</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                // 자기 행은 RLS가 막는다. 누를 수 있게 두면 화면이 거짓말을 한다.
                const isSelf = row.id === userId;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.loginId}
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.level}</TableCell>
                    <TableCell>
                      {row.is_active ? (
                        "활성"
                      ) : (
                        <span className="text-destructive">비활성</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.authFetchFailed
                        ? "조회 실패"
                        : row.lastSignInAt
                          ? new Date(row.lastSignInAt).toLocaleString("ko-KR")
                          : "기록 없음"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.createdByName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <form action={setAdminLevel}>
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="level"
                            value={row.level === "owner" ? "admin" : "owner"}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                          >
                            {row.level === "owner" ? "admin으로" : "owner로"}
                          </Button>
                        </form>
                        <form action={setAdminActive}>
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={row.is_active ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            variant={row.is_active ? "destructive" : "secondary"}
                            size="sm"
                            disabled={isSelf}
                          >
                            {row.is_active ? "비활성화" : "활성화"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground text-xs">
          자기 계정의 등급과 활성 상태는 바꿀 수 없습니다 — 마지막 owner가 스스로를
          내리면 아무도 관리자를 추가할 수 없게 됩니다.
        </p>
      </section>
    </div>
  );
}
