import { Skeleton } from "@ttokttok/ui/components/skeleton";

export default function ReelsLoading() {
  return (
    <div role="status" aria-label="릴스 불러오는 중" className="relative h-full">
      <span className="sr-only">릴스를 불러오는 중이에요.</span>
      <Skeleton aria-hidden="true" className="h-full w-full rounded-none motion-reduce:animate-none" />
    </div>
  );
}
