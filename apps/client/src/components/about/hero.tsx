import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { AssetSlot, AvatarStack } from "@/components/about/asset-slot";
import { Marquee } from "@/components/about/marquee";
import { Container, SearchForm, Stat } from "@/components/about/primitives";
import { RotatingWord } from "@/components/about/rotating-word";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-muted text-foreground/80 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm">
      {children}
    </span>
  );
}

/** 로고 줄 자리 — 폭을 달리한 슬롯 여섯이 흐른다. */
const LOGO_WIDTHS = ["w-28", "w-24", "w-32", "w-20", "w-28", "w-24"];

/**
 * 히어로 — 참고 사이트의 3줄 제목(회전 강조어 하나) + 오른쪽 설명·폼, 아래에
 * 통계 2개와 흐르는 로고 줄. 한글은 라틴보다 자당 폭이 넓어 `lg:text-7xl`에서
 * 3줄을 지키려면 한 줄 8~10자여야 한다. 회전어는 뒤에 「이」가 붙으므로 받침
 * 있는 단어만 쓴다.
 */
export function Hero() {
  return (
    <Container className="pt-10 pb-16 md:pt-20 md:pb-24">
      <div className="flex flex-wrap gap-2">
        <Badge>
          <span className="bg-foreground text-background grid size-4 place-items-center rounded-full text-[10px] font-bold">
            문
          </span>
          위키문헌 공개 저작물 기반
        </Badge>
        <Badge>
          <Star className="size-3.5 fill-current" aria-hidden />
          무료
          <Star className="size-3.5 fill-current" aria-hidden />
          설치 없음
        </Badge>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight break-keep sm:text-5xl lg:text-7xl">
          읽을{" "}
          <RotatingWord
            words={["소설", "수필", "희곡", "동화"]}
            className="text-foreground/35"
          />
          이
          <br />
          먼저 노크해요 —
          <br />
          발견부터 첫 장까지
        </h1>

        <div className="lg:pt-3">
          <p className="text-muted-foreground text-lg leading-relaxed break-keep md:text-xl">
            저작권이 만료된 한국 문학의 전문을{" "}
            <AvatarStack className="text-[1.1em]" /> 결제도 설치도 없이 — 카드
            한 장에서 시작해 그 자리에서 첫 장을 읽습니다. 몇 분이면 될까요?
            릴스로 먼저 만나 보세요.
          </p>
          <SearchForm id="hero-search" className="mt-10" cta="찾아보기" />
        </div>
      </div>

      <div className="mt-16 grid gap-10 md:mt-24 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-wrap gap-x-14 gap-y-8">
          <Stat
            value="1962"
            label={
              <>
                년 이전 사망 저작자의
                <br />
                작품 전문을 무료로
              </>
            }
          />
          <Stat
            value="0원"
            label={
              <>
                결제도 설치도 없이
                <br />
                바로 읽기
              </>
            }
          />
        </div>
        <Marquee fade itemsClassName="gap-16 pr-16">
          {LOGO_WIDTHS.map((w, i) => (
            <AssetSlot key={i} className={`h-7 rounded-md ${w}`} />
          ))}
        </Marquee>
      </div>
    </Container>
  );
}
