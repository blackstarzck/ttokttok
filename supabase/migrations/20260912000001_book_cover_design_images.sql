-- 3D 표지 이미지 템플릿: 면별 원본 주소를 같은 JSONB에 둔다. 제약은 그대로다.
comment on column public.books.cover_design is
  '3D 표지 편집 설정: version, template(classic/modern/literary/image), palette, title, author, angle, tilt, thickness, images{front,spine?,back?}(covers/{id}/design-{face}-*.webp 공개 URL). 이미지와 같은 저장에서 갱신.';
