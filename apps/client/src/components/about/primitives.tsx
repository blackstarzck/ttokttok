import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@ttokttok/ui/utils";

/** 참고 사이트의 1280px 컬럼. */
export const CONTAINER = "mx-auto w-full max-w-7xl px-5 md:px-8";

/**
 * 캐러셀 스크롤러의 좌우 여백 — 첫 카드가 컨테이너 왼쪽 선에 맞고 마지막 카드는
 * 화면 끝까지 밀려 나간다. 폭이 80rem보다 좁으면 `min()`이 컨테이너 패딩으로
 * 줄어든다.
 */
export const BLEED =
  "px-[calc((100%-min(100%,80rem))/2+1.25rem)] scroll-px-[calc((100%-min(100%,80rem))/2+1.25rem)] md:px-[calc((100%-min(100%,80rem))/2+2rem)] md:scroll-px-[calc((100%-min(100%,80rem))/2+2rem)]";

export function Container({
  className,
  children,
  id,
}: {
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={cn(CONTAINER, className)}>
      {children}
    </div>
  );
}

/**
 * 위 모서리가 둥근 섹션 면. 앞 섹션 위로 3rem 겹쳐 올라가 참고 사이트의
 * "다음 면이 앞 면을 덮는" 전환을 만든다. 나중 형제가 위에 그려지므로
 * z-index는 필요 없다.
 */
export function Surface({
  tone,
  className,
  children,
  id,
}: {
  tone: "white" | "gray";
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative -mt-12 rounded-t-[3rem] pt-12",
        tone === "white" ? "bg-card" : "bg-background",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-3xl font-semibold tracking-tight break-keep md:text-[2.5rem] md:leading-[1.15]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Chip({
  children,
  tone = "light",
  active = false,
  className,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap",
        tone === "light" &&
          (active
            ? "border-foreground bg-foreground text-background"
            : "border-border/85 bg-card text-foreground/80"),
        tone === "dark" && "border-background/20 text-background",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * 검정 버튼. 호버하면 밝은 띠가 왼쪽에서 오른쪽으로 한 번 지나간다 — 참고
 * 사이트 `.button:hover`의 `.button-background`(buttonBg) 광택. `group`이라
 * 호버는 버튼 전체에서 잡힌다.
 */
const DARK_BUTTON =
  "group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-foreground px-6 text-base font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none active:translate-y-px";

function Sheen() {
  return (
    <span
      aria-hidden
      className="via-background/25 pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent to-transparent opacity-0 group-hover:opacity-100 motion-safe:group-hover:animate-shimmer"
    />
  );
}

export function DarkButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(DARK_BUTTON, className)}>
      {children}
      <Sheen />
    </Link>
  );
}

export function SoftButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "bg-muted focus-visible:ring-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors duration-[250ms] hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_7%)] focus-visible:ring-2 focus-visible:outline-none active:translate-y-px",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * 「››› 피드 열기 ‹‹‹」의 쉐브론 셋. 참고 사이트처럼 1.5초 주기로 셋이 위상을
 * 달리해 밝아졌다 어두워진다(animatedButtonFirst/Second/Third). 장식이라
 * 낭독기에서 뺀다.
 */
export function PulseChevrons({ dir }: { dir: "left" | "right" }) {
  const Icon = dir === "right" ? ChevronRight : ChevronLeft;
  const order = dir === "right" ? [1, 2, 3] : [3, 2, 1];
  return (
    <span aria-hidden className="inline-flex items-center -space-x-1.5">
      {order.map((n) => (
        <Icon
          key={n}
          className={cn(
            "size-3.5 opacity-60",
            n === 1 && "motion-safe:animate-pulse-chevron-1",
            n === 2 && "motion-safe:animate-pulse-chevron-2",
            n === 3 && "motion-safe:animate-pulse-chevron-3",
          )}
        />
      ))}
    </span>
  );
}

/**
 * 참고 사이트의 이메일 입력 + 버튼 묶음과 같은 모양이지만, 실제로는 도서·작가
 * 검색이다 (`/discover?q=`). 이메일은 모으지 않는다 (2026-09-09 설계 비목표).
 * GET 폼이라 JS가 필요 없다.
 */
export function SearchForm({
  cta = "찾아보기",
  className,
  id,
}: {
  cta?: string;
  className?: string;
  id: string;
}) {
  return (
    <form
      action="/discover"
      method="get"
      role="search"
      className={cn(
        "border-border/60 bg-card flex items-center gap-2 rounded-[1.25rem] border p-1.5 pl-5",
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        책이나 작가 이름
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="책이나 작가 이름"
        autoComplete="off"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none"
      />
      <button type="submit" className={cn(DARK_BUTTON, "h-12 shrink-0 px-5")}>
        <Search className="size-4 sm:hidden" aria-hidden />
        <span className="sr-only sm:not-sr-only">{cta}</span>
        <Sheen />
      </button>
    </form>
  );
}

export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <p className="text-4xl leading-none font-medium tracking-tight md:text-[2.75rem]">
        {value}
      </p>
      <p className="text-muted-foreground pt-1 text-sm leading-snug break-keep">
        {label}
      </p>
    </div>
  );
}

/** 벤토 카드 우상단의 흰 원형 아이콘 자리. */
export function IconCircle({ children }: { children: ReactNode }) {
  return (
    <span className="border-border/85 bg-card grid size-16 shrink-0 place-items-center rounded-full border [&_svg]:size-6">
      {children}
    </span>
  );
}
