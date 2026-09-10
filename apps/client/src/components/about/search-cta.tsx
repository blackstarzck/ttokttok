import { AssetSlot } from "@/components/about/asset-slot";
import { Container, SearchForm } from "@/components/about/primitives";
import { RotatingWord } from "@/components/about/rotating-word";

/** 참고 사이트 "Get your design done without headache" 카드 — 텍스트+폼, 오른쪽 잔디 자리. */
export function SearchCta() {
  return (
    <Container className="pb-16 md:pb-24">
      <div className="bg-muted grid overflow-hidden rounded-[2rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="p-8 md:p-14">
          <h2 className="text-3xl leading-[1.1] font-medium tracking-tight break-keep md:text-5xl">
            읽고 싶던{" "}
            <RotatingWord
              fast
              words={["책", "소설", "시", "수필"]}
              className="text-foreground/35"
            />
            ,
            <br />
            오늘 첫 장부터
          </h2>
          <SearchForm id="cta-search" className="mt-8 max-w-md" cta="찾아보기" />
        </div>
        <AssetSlot tone="inset" className="min-h-[14rem] lg:min-h-0" />
      </div>
    </Container>
  );
}
