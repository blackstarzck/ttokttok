import Image from "next/image";

/** Theme classes match the app's saved preference, including light-only admin. */
export function BrandLogo() {
  return (
    <span className="inline-flex shrink-0 align-middle">
      <Image
        src="/brand/ttok-ttok-lockup-light.png"
        alt="똑똑"
        width={775}
        height={320}
        sizes="78px"
        className="block h-8 w-auto dark:hidden"
      />
      <Image
        src="/brand/ttok-ttok-lockup-dark.png"
        alt="똑똑"
        width={775}
        height={320}
        sizes="78px"
        className="hidden h-8 w-auto dark:block"
      />
    </span>
  );
}
