-- 관리자에서 제작한 3D 표지의 재편집 설정. 기존 업로드 표지는 NULL 유지.
alter table public.books add column cover_design jsonb;
alter table public.books add constraint books_cover_design_object
  check (cover_design is null or (jsonb_typeof(cover_design) = 'object' and cover_url is not null));
comment on column public.books.cover_design is
  '3D 표지 편집 설정: version, template, palette, title, author, angle, thickness. 이미지와 같은 저장에서 갱신.';
