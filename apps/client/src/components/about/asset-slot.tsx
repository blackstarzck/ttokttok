import { cn } from "@ttokttok/ui/utils";

/**
 * 에셋(사진·영상·로고·질감)이 들어갈 자리. 비율·크기는 className이 정한다.
 *
 * 안은 비어 있다 — 라벨도 점선도 없다 (설계 결정 2). 자리를 예약하므로 나중에
 * 이미지를 넣어도 레이아웃이 뛰지 않는다. 장식이라 접근성 트리에서 뺀다.
 *
 * tone: `light`는 흰 면 위, `inset`은 회색 면 위(한 단계 더 어둡게), `dark`는
 * 검정 카드 위.
 */
export function AssetSlot({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "inset" | "dark";
}) {
  // span인 이유: 자리가 <p>·<h2> 안에도 놓인다 — div는 p의 자식이 될 수 없어
  // 하이드레이션이 깨진다. 기본은 block이고 호출부가 inline-block으로 덮는다.
  return (
    <span
      aria-hidden
      className={cn(
        "block shrink-0",
        tone === "light" && "bg-muted",
        tone === "inset" && "bg-foreground/8",
        tone === "dark" && "bg-background/10",
        className,
      )}
    />
  );
}

/** 문장 사이에 끼는 작은 아바타 세 개 — 참고 사이트의 인라인 얼굴 묶음. */
export function AvatarStack({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex -space-x-2 align-middle", className)}
    >
      <span className="bg-foreground/15 ring-card size-[1em] rounded-full ring-2" />
      <span className="bg-foreground/25 ring-card size-[1em] rounded-full ring-2" />
      <span className="bg-foreground/35 ring-card size-[1em] rounded-full ring-2" />
    </span>
  );
}
