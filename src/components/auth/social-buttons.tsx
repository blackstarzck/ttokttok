"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "kakao";

const PROVIDERS: { key: Provider; label: string; className: string }[] = [
  {
    key: "kakao",
    label: "카카오로 계속하기",
    // 카카오는 브랜드 색이 규정돼 있어 시맨틱 토큰을 쓸 수 없다.
    // DESIGN.md의 무채색 원칙에 대한 명시적 예외 (외부 브랜드 자산).
    className: "bg-[#FEE500] text-[#191600] hover:bg-[#FEE500]/90",
  },
  {
    key: "google",
    label: "구글로 계속하기",
    className: "bg-white text-[#1f1f1f] hover:bg-white/90",
  },
];

/**
 * 소셜로그인 버튼 (PRD §5.8 — 구글·카카오만, 이메일 가입 없음).
 *
 * 로그인 후 돌아올 곳은 지금 보고 있던 화면이다. 피드에서 좋아요를
 * 누르다 로그인했는데 홈으로 튕기면 흐름이 끊긴다.
 */
export function SocialButtons({ next }: { next?: string }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider);

    const target = next ?? pathname ?? "/";
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;

    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback },
    });

    if (error) {
      setPending(null);
      toast.error("로그인을 시작하지 못했어요");
      console.error("signInWithOAuth:", error.message);
    }
    // 성공하면 브라우저가 곧바로 이동하므로 pending을 풀지 않는다.
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.key}
          type="button"
          size="lg"
          onClick={() => signIn(p.key)}
          disabled={pending !== null}
          className={`min-h-12 w-full font-medium ${p.className}`}
        >
          {pending === p.key ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : null}
          {p.label}
        </Button>
      ))}
    </div>
  );
}
