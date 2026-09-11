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
  // 한 번 불러 메모리에서 붙인다 (설계 §5). 관리자 수는 한 자릿수다.
  const { data: authUsers, error: authError } = await createAdminClient()
    .auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw new Error(authError.message);

  const byId = new Map(authUsers.users.map((u) => [u.id, u]));
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = accounts.map((a) => {
    const authUser = byId.get(a.id);
    return {
      ...a,
      loginId: emailToAdminId(authUser?.email) ?? "—",
      lastSignInAt: authUser?.last_sign_in_at ?? null,
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
                      {row.lastSignInAt
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
