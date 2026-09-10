import Image from "next/image";

/**
 * Theme classes match the app's saved preference, including light-only admin.
 *
 * 접힘선 위(상단 바·어드민 헤더·로그인)에서는 `priority`를 켠다. 기본값
 * lazy로 두면 레이아웃이 잡힌 뒤에야 받기 시작해 로고가 한 박자 늦게 뜬다.
 * 대가는 숨은 테마 쪽 한 장을 같이 받는 것이다 — 실측 2,866 B(w=256).
 * 켜지 않은 자리(푸터)는 그대로 lazy로 둔다.
 */
export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <span className="inline-flex shrink-0 align-middle">
      <Image
        src="/brand/ttok-ttok-lockup-light.png"
        alt="똑똑"
        width={775}
        height={320}
        sizes="78px"
        priority={priority}
        className="block h-8 w-auto dark:hidden"
      />
      <Image
        src="/brand/ttok-ttok-lockup-dark.png"
        alt="똑똑"
        width={775}
        height={320}
        sizes="78px"
        priority={priority}
        className="hidden h-8 w-auto dark:block"
      />
    </span>
  );
}
