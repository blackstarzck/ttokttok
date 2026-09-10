import { cn } from "@ttokttok/ui/utils";

/**
 * 참고 사이트 히어로의 회전 강조어. 단어 넷에 첫 단어를 한 번 더 붙여 세로로
 * 쌓고 1lh씩 밀어 올린다(`word-loop`, globals.css의 소개 전용 모션 토큰).
 * 마지막이 첫 단어라 이음새가 없고, `motion-safe:`라 감속 설정에서는 첫 단어에
 * 멈춰 있다. 낭독기는 첫 단어만 읽는다.
 *
 * 폭은 가장 긴 단어에 고정되므로 단어가 바뀌어도 줄이 뛰지 않는다. 뒤에 조사가
 * 붙는 자리라면 받침 유무가 같은 단어만 넣는다 — 이/가, 은/는이 갈린다.
 */
export function RotatingWord({
  words,
  className,
  fast = false,
}: {
  words: readonly [string, string, string, string];
  className?: string;
  fast?: boolean;
}) {
  const stack = [...words, words[0]];
  return (
    <span
      className={cn(
        "relative inline-block h-[1lh] overflow-hidden align-top",
        className,
      )}
    >
      <span className="sr-only">{words[0]}</span>
      <span
        aria-hidden
        className={cn(
          "block",
          fast
            ? "motion-safe:animate-word-loop-fast"
            : "motion-safe:animate-word-loop",
        )}
      >
        {stack.map((word, i) => (
          <span key={i} className="block">
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}
