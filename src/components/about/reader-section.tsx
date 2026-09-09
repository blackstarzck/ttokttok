import { DeviceFrame } from "@/components/about/device-frame";

/**
 * 히어로와 좌우가 반전된 split — 데스크톱에서 캡처가 왼쪽이다.
 *
 * DOM 순서는 텍스트가 먼저다. 375px에서는 제목을 읽고 나서 화면을 보는
 * 편이 자연스럽고, 데스크톱 배치는 `md:order-*`가 뒤집는다.
 *
 * `src`가 `null`이면 섹션이 아예 안 그려진다 — 캡처할 전문 도서가 없을 때
 * 없는 화면을 그려 넣지 않는다 (설계 결정 6).
 */
export function ReaderSection({
  src,
  width,
  height,
}: {
  src: string | null;
  width: number;
  height: number;
}) {
  if (!src) return null;

  return (
    <section className="border-border bg-muted/40 border-y">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="md:order-2">
          <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
            발견에서 첫 장까지, 탭 한 번
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[32rem] text-base leading-relaxed break-keep">
            서점을 검색하고 앱을 설치하는 과정이 없습니다. 카드에서 마음이
            움직인 그 순간에 뷰어가 열립니다. 글자 크기와 배경은 읽는 중에
            바꿀 수 있고, 읽던 위치는 저장됩니다.
          </p>
        </div>
        <div className="md:order-1">
          <DeviceFrame
            src={src}
            alt="똑똑 전자책 뷰어 화면"
            width={width}
            height={height}
          />
        </div>
      </div>
    </section>
  );
}
