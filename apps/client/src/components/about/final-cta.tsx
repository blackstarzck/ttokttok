import { AssetSlot, AvatarStack } from "@/components/about/asset-slot";
import { Container, SearchForm, Surface } from "@/components/about/primitives";

/** 참고 사이트 "You are one call away from a top creative team" + 아래 잔디 띠. */
export function FinalCta() {
  return (
    <Surface tone="white">
      <Container className="pt-20 text-center md:pt-32">
        <h2 className="mx-auto max-w-4xl text-4xl leading-[1.1] font-medium tracking-tight break-keep md:text-6xl">
          탭 한 번이면
          <br />
          첫 <AvatarStack className="text-[0.9em]" /> 장이 열립니다
        </h2>
        <SearchForm
          id="final-search"
          className="mx-auto mt-10 max-w-md text-left"
          cta="찾아보기"
        />
      </Container>
      {/* 잔디 띠 — FAQ 면이 둥근 모서리로 이 위에 올라온다. */}
      <AssetSlot tone="inset" className="mt-16 h-40 w-full md:h-64" />
    </Surface>
  );
}
