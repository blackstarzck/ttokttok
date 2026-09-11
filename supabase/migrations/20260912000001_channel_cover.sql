-- 채널 커버 이미지 — 채널 홈 히어로의 배경 (PRD §5.9).
-- 설계: docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md
-- 아바타(avatar_url)와 같은 방식으로 어드민이 URL을 입력한다. NULL이면 화면이
-- 아바타 블러 → --post-navy 단색 순으로 폴백하므로 NOT NULL을 걸지 않는다.
-- RLS는 channels 공개 read 정책이 이미 있어 바뀌지 않는다.
alter table public.channels add column cover_url text;
