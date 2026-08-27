import { Badge } from "@/components/ui/badge";

/**
 * 셋업 단계용 자리표시자. 각 화면이 실제 구현으로 교체되면서 삭제된다.
 */
export function PlaceholderScreen({
  title,
  phase,
  description,
  todo,
}: {
  title: string;
  phase: string;
  description: string;
  todo: string[];
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="space-y-3">
        <Badge variant="secondary">{phase}</Badge>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          구현 예정
        </h2>
        <ul className="space-y-2">
          {todo.map((item) => (
            <li
              key={item}
              className="border-border bg-card rounded-lg border p-3 text-sm"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
