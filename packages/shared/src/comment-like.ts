/** 하트 하나의 표시 상태. */
export type LikeState = { liked: boolean; count: number };

/**
 * 토글 후 상태를 만든다. 순수 함수라 단위 테스트 대상이다 —
 * 두 번 눌렀을 때 제자리로 돌아오는지, 카운트가 0 아래로 새지 않는지가
 * 이 기능에서 유일하게 틀리기 쉬운 산술이다.
 *
 * 0 하한이 필요한 이유: 서버 카운트가 0인데 liked가 true인 어긋난 상태가
 * 들어올 수 있고(트리거의 greatest와 같은 방어), 그때 화면에 -1을 그리면
 * 안 된다.
 */
export function nextLikeState({ liked, count }: LikeState): LikeState {
  return liked
    ? { liked: false, count: Math.max(count - 1, 0) }
    : { liked: true, count: count + 1 };
}
