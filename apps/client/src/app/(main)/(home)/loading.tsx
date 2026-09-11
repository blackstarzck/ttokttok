import { Skeleton } from "@ttokttok/ui/components/skeleton";
import { CARD_SCROLL_ITEM } from "@ttokttok/ui/feed/card-metrics";

export default function HomeLoading() {
  return (
    <div role="status" aria-label="홈 불러오는 중" className="flex h-full flex-col">
      <span className="sr-only">홈을 불러오는 중이에요.</span>
      <div aria-hidden="true" className="flex h-14 shrink-0 items-center px-4">
        <Skeleton className="h-8 w-20 motion-reduce:animate-none" />
      </div>
      <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden">
        <div className={`${CARD_SCROLL_ITEM} bg-card gap-4 p-4`}>
          <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
          <Skeleton className="min-h-0 flex-1 motion-reduce:animate-none" />
          <Skeleton className="h-11 w-full motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
