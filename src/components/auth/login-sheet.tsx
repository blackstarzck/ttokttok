"use client";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { SocialButtons } from "@/components/auth/social-buttons";

/**
 * 로그인 바텀시트 (PRD §5.8).
 *
 * 좋아요·댓글·찜을 누른 그 자리에서 뜬다 — 별도 페이지로 보내면 하던
 * 일을 잃는다. 트리거를 children으로 받아 진입점마다 생김새를 맞춘다.
 */
export function LoginSheet({
  reason,
  children,
}: {
  /** 왜 로그인이 필요한지 — "좋아요를 누르려면" 같은 문구 */
  reason?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>로그인</DrawerTitle>
          <DrawerDescription>
            {reason ?? "계정을 연결하면 읽은 기록이 기기 사이에서 이어집니다."}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerFooter>
          <SocialButtons />
          <p className="text-muted-foreground text-center text-xs">
            로그인하면 서비스 이용약관에 동의하는 것으로 봅니다.
          </p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
