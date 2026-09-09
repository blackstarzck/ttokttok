import Image from "next/image";

/**
 * 실제 화면 캡처를 모바일 폭 프레임에 담는다. 뷰어·릴스 섹션이 공유한다.
 *
 * `width`/`height`로 비율을 먼저 예약해 레이아웃 시프트를 막는다 (CLS).
 * 두 값은 **캡처 PNG의 실제 픽셀 크기**여야 한다 — 호출부가 넘긴다.
 */
export function DeviceFrame({
  src,
  alt,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <div className="border-border bg-card mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 768px) 70vw, 280px"
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}
