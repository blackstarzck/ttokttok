"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="text-muted-foreground min-h-11 min-w-11"
      aria-label="로그아웃"
      onClick={async () => {
        await createClient().auth.signOut();
        router.refresh();
      }}
    >
      <LogOut aria-hidden />
    </Button>
  );
}
