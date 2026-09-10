import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@ttokttok/ui/components/avatar";
import { TemplateCard } from "@ttokttok/ui/cards/template-card";

import type { ReactNode } from "react";

import type { FeedPost } from "@ttokttok/shared/feed";

/**
 * 홈 피드의 카드 한 장 (IA 개편 결정 3).
 *
 * 위에서 아래로 채널 헤더 → 본문 → 액션 줄 → 도서 바. 전면 피드가
 * 오버레이인 것과 달리 여기는 **쌓기**다 — 크롬이 컨텐츠를 가리지 않으므로
 * 스크림도 세이프존도 필요 없다.
 *
 * 본문 상자는 **고정 비율이 아니라 내용에 맞춰 늘어난다**. 근거와 실측은
 * template-card.tsx의 카드 모드 주석 — 4:5로 고정했던 첫 시도는 폭
 * 320~480px 전 구간과 도서명 1~3줄 전 조합을 만족하는 상자 높이가
 * 존재하지 않았다(좁은 폭은 넘치고 넓은 폭은 텅 빈다). 넘칠 때 flex가
 * 표지를 눌러 흡수하는데, 그 압축이 overflow 수치에 잡히지 않아 표지가
 * 찌그러진 채 조용히 나가는 것이 4:5를 버린 이유다.
 */
export function PostCardView({
  post,
  preview,
  actions,
  bookInfo,
}: {
  post: FeedPost;
  preview?: boolean;
  actions: ReactNode;
  bookInfo: ReactNode;
}) {
  return (
    // 풀블리드 — 좌우 여백을 두지 않는다. 인스타가 그렇고, 폭이 좁아질수록
    // 글이 더 여러 줄로 늘어나 본문이 더 길어지는데(narrow=더 높다), 넓어
    // 지면 반대로 짧아진다 — 폭을 좌우 패딩 없이 최대로 주는 쪽이 그 변동
    // 폭을 줄인다. 구분은 여백이 아니라 아래 경계선이 맡고, 모서리도
    // 둥글리지 않는다(화면 끝에 닿는 둥근 모서리는 어색하다).
    //
    // overflow-hidden을 걷어냈다 — §11-54의 두 번째 방어선("찌그러진 채
    // 조용히 나가는 대신, 넘치면 눈에 띄게")이 기대는 바로 그 신호를 가리는
    // 클래스였다. 높이 제약이 다시 들어오면 밀려난 바이라인·액션 줄을 이
    // 클래스가 가려 오버플로 수치도 0, 표지 비율도 0.667로 나와 탐지기
    // 둘이 동시에 침묵한다. 이 브랜치에서 생긴 부수 효과도 있다: article이
    // 새 grow 체인의 flex 항목이 됐는데, CSS Flexbox §4.5에 따르면 overflow가
    // visible이 아닌 flex 항목은 자동 최소 크기가 0이라 내용 기반 바닥을
    // 잃는다. 애초에 aspect-4/5 시절의 잔재였다 — article엔 라운딩이 없고,
    // 잘리는 자식(Avatar, BookCover)은 스스로 자른다. 플랜의 전역 제약도
    // 명시한다: "height·max-height·aspect-*·overflow-hidden을 카드 높이에
    // 걸지 않는다".
    <article className="border-border bg-card flex grow flex-col border-b">
      <Link
        href={`/channel/${post.channels.slug}`}
        prefetch={preview ? false : undefined}
        className="focus-visible:ring-ring flex min-h-11 items-center gap-2 px-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar className="size-7">
          {post.channels.avatar_url ? (
            <AvatarImage src={post.channels.avatar_url} alt="" />
          ) : null}
          <AvatarFallback className="text-xs">
            {post.channels.name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">
          {post.channels.name}
        </span>
      </Link>

      {/* 배경은 중앙에만 적용한다. 상하단 정보는 카드 표면을 유지한다. */}
      <div data-card-body className="flex grow flex-col">
        <TemplateCard
          layout={post.post_cards}
          book={post.books}
          variant="card"
          preview={preview}
        />
      </div>

      <div className="py-1">{actions}</div>

      {bookInfo}
    </article>
  );
}
