import { Skeleton } from "@ttokttok/ui/components/skeleton";

export default function ProfileLoading() {
  return (
    <div role="status" aria-label="프로필 불러오는 중" className="flex h-full flex-col gap-6 overflow-hidden p-4">
      <span className="sr-only">프로필을 불러오는 중이에요.</span>
      <div aria-hidden="true" className="flex items-center gap-3">
        <Skeleton className="size-14 shrink-0 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
      </div>
      <Skeleton aria-hidden="true" className="h-11 w-full shrink-0 motion-reduce:animate-none" />
      <Skeleton aria-hidden="true" className="h-24 w-full shrink-0 motion-reduce:animate-none" />
    </div>
  );
}
