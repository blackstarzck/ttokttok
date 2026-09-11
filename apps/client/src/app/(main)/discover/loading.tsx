import { Skeleton } from "@ttokttok/ui/components/skeleton";

export default function DiscoverLoading() {
  return (
    <div role="status" aria-label="탐색 불러오는 중" className="flex h-full flex-col gap-6 overflow-hidden p-4">
      <span className="sr-only">탐색을 불러오는 중이에요.</span>
      <Skeleton aria-hidden="true" className="h-11 w-full shrink-0 motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
