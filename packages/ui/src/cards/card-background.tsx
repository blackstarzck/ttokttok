import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { resolveCardBackground } from "@ttokttok/shared/card-background";
import type { FeedCardLayout } from "@ttokttok/shared/feed";

/** 배경과 글자만 테마 독립적이다. 채널/도서/버튼 영역에는 영향을 주지 않는다. */
export function CardBackgroundSurface({ background, children }: {
  background: FeedCardLayout["background"];
  children: ReactNode;
}) {
  const bg = resolveCardBackground(background);
  const color = bg.type === "image"
    ? bg.text === "light" ? "var(--post-navy)" : "var(--post-paper)"
    : bg.color ?? "var(--post-paper)";
  return (
    <div data-card-background={bg.type} data-card-ink={bg.text}
      className="card-background relative isolate flex h-full grow flex-col"
      style={{ "--post-background-color": color } as CSSProperties}>
      {bg.type === "image" && bg.imageUrl ? (
        <>
          <Image src={bg.imageUrl} alt="" fill sizes="(max-width: 480px) 100vw, 480px"
            unoptimized={bg.imageUrl.startsWith("blob:")}
            className="pointer-events-none object-cover"
            style={{ objectPosition: `${bg.x}% ${bg.y}%` }} />
          <div aria-hidden className="card-background-dim pointer-events-none absolute inset-0"
            style={{ opacity: bg.dim / 100 }} />
        </>
      ) : null}
      <div className="relative flex grow flex-col">{children}</div>
    </div>
  );
}
