import Link from "next/link";
import { AssetSlot } from "@/components/about/asset-slot";
import { PulseChevrons } from "@/components/about/primitives";

/** 참고 사이트 "Free consultation to scope your creative projects" — 잔디 전면 위 흰 글자. */
export function GrassCta() {
  return (
    <section className="bg-foreground text-background relative -mt-12 overflow-hidden rounded-t-[3rem]">
      <AssetSlot tone="dark" className="absolute inset-0" />
      <div className="relative px-5 pt-44 pb-32 text-center md:pt-56 md:pb-44">
        <h2 className="text-4xl leading-[1.1] font-medium tracking-tight break-keep md:text-6xl">
          첫 장은 언제나
          <br />
          무료입니다
        </h2>
        <Link
          href="/"
          className="border-background/20 bg-background/10 hover:bg-background/20 focus-visible:ring-background mt-10 inline-flex h-14 items-center gap-3 rounded-2xl border px-6 text-base font-medium backdrop-blur transition-colors duration-[250ms] focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
        >
          <PulseChevrons dir="right" />
          피드 열기
          <PulseChevrons dir="left" />
        </Link>
      </div>
    </section>
  );
}
