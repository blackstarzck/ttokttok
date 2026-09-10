-- 기존 행과 표지/영상 작업을 보존한다. NULL은 기본 단색 배경이다.
alter table public.post_cards
  add column background jsonb default null
  constraint post_cards_background_object check (
    background is null or jsonb_typeof(background) = 'object'
  );

comment on column public.post_cards.background is
  '게시글 중앙 배경: type, color, imageUrl, text, dim, x, y. 이미지는 covers/post-backgrounds/ 아래 저장.';
