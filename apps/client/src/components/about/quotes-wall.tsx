import { ArrowUpRight, Star } from "lucide-react";
import {
  Chip,
  Container,
  SectionTitle,
  SoftButton,
  Surface,
} from "@/components/about/primitives";
import { QUOTES } from "@/components/about/quotes";
import { QuoteCard } from "@/components/about/quote-card";

/**
 * 참고 사이트 "Trusted by 4,000+ companies"의 후기 벽. 3열 메이슨리, 아래는
 * 바탕색으로 흐려져 잘리고 "더 보기"가 이어진다. 후기 대신 작품의 문장.
 */
export function QuotesWall() {
  return (
    <Surface tone="gray">
      <Container className="py-16 md:py-24">
        <div className="flex justify-center gap-2">
          <Chip>
            <Star className="size-3.5 fill-current" aria-hidden /> 공개 저작물
          </Chip>
          <Chip>
            <Star className="size-3.5 fill-current" aria-hidden /> 위키문헌 수급
          </Chip>
        </div>
        <SectionTitle className="mt-6 text-center">
          책이 먼저 건네는 문장들
        </SectionTitle>

        <div className="relative mt-12 max-h-[68rem] overflow-hidden">
          <div className="columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {QUOTES.map((q) => (
              <QuoteCard key={`${q.author}-${q.work}`} quote={q} />
            ))}
          </div>
          <div
            aria-hidden
            className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent"
          />
        </div>

        <div className="mt-6 text-center">
          <SoftButton href="/discover" className="bg-card border-border/85 border">
            더 보기 <ArrowUpRight className="size-4" aria-hidden />
          </SoftButton>
        </div>
      </Container>
    </Surface>
  );
}
