#!/usr/bin/env bash
#
# get_feed_v4의 점수 고정 검증 (마이그레이션 20260907000001).
#
#   bash scripts/verify-feed-score-freeze.sh
#
# 전제: 로컬 Supabase(`npx supabase start`)와 psql. **로컬 전용이다** —
# 운영 DB에 대고 돌리면 record_view로 조회수를 부풀린다. 끝에서 view_count와
# 로그를 되돌리지만, 되돌림이 실패하면 남는다.
#
# `npm test`에 넣지 않는 이유: vitest는 environment=node에 순수 함수만
# 돌린다(FRONTEND.md). DB가 필요한 이 검사는 그 밖이다. 그런데 여기서
# 지키는 불변식은 **빌드도 타입체크도 vitest도 잡지 못하고**, 사용자에게는
# "2페이지에 방금 본 게시물이 또 나온다"로만 보인다. 이 RPC를 건드리면
# 손으로 한 번 돌려라.
#
# 무엇을 지키는가: 한 번의 페이지네이션 동안 게시물의 점수는 변하지
# 않는다. 점수가 살아 있는 now()·카운터에 의존하면, 1페이지를 보는 행위
# 자체가 그 게시물들의 점수를 끌어내려 키셋 커서(`score < cursor`) 바로
# 아래로 밀어 넣는다 — 1페이지가 2페이지에 다시 나온다.
set -u
export PGPASSWORD="${PGPASSWORD:-postgres}"
PGH="${PGHOST:-127.0.0.1}"
PGP="${PGPORT:-54322}"

# psql이 Windows에서 CRLF로 뱉는다. CR을 안 지우면 문자열 비교가 조용히
# 전부 "다르다"가 되어 comm -12가 겹치는 것을 못 찾고 "중복 없음"으로
# 거짓 통과한다 — 이 스크립트를 쓰다가 실제로 그렇게 속았다.
Q() { psql -h "$PGH" -p "$PGP" -U postgres -d postgres -At -c "$1" | tr -d '\r'; }

SESS="freeze-sess-$$"
OTHER="other-sess-$$"
SEED="freeze-seed"
SNAP="${TMPDIR:-/tmp}/ttokttok-view-count-$$.txt"

# 조회 시뮬레이션은 반드시 record_view로 한다. view_logs에 직접 insert하면
# view_count가 같이 오르지 않고, 그러면 점수 고정의 view_count 되돌림이
# 있지도 않은 조회를 빼서 점수를 조용히 낮춘다 — 멀쩡한 구현에 가짜 중복이
# 뜬다. 실제로 한 번 겪었다.
view() { Q "select record_view('$1'::uuid,'$2');" >/dev/null; }

Q "select id||' '||view_count from posts;" > "$SNAP"

restore() {
  while read -r line; do
    [ -z "$line" ] && continue
    Q "update posts set view_count=${line#* } where id='${line%% *}';" >/dev/null
  done < "$SNAP"
  Q "delete from view_logs where session_id like 'freeze-sess-%' or session_id like 'other-sess-%';" >/dev/null
  Q "delete from analytics_events where session_id like 'freeze-sess-%' or session_id like 'other-sess-%';" >/dev/null
  rm -f "$SNAP"
}
trap restore EXIT

FAIL=0

echo "### 1페이지 (limit 3, cards)"
P1=$(Q "select id||' '||cursor_token from get_feed_v4('$SEED','$SESS',3,null,null,'cards');")
if [ -z "$P1" ]; then
  echo "게시물이 없다 — 먼저 시드하라: node --env-file=.env scripts/seed.mjs"
  exit 1
fi
echo "$P1"
P1_IDS=$(echo "$P1" | cut -d' ' -f1)
LAST=$(echo "$P1" | tail -1)
LAST_ID=$(echo "$LAST" | cut -d' ' -f1)
LAST_TOK=$(echo "$LAST" | cut -d' ' -f2-)

echo
echo "### 사용자가 1페이지를 본다 (record_view — 실제 경로)"
for id in $P1_IDS; do view "$id" "$SESS"; done
echo "view_logs 행: $(Q "select count(*) from view_logs where session_id='$SESS';")"

echo
echo "### 2페이지 (커서 = 1페이지 마지막)"
P2=$(Q "select id from get_feed_v4('$SEED','$SESS',3,'$LAST_TOK','$LAST_ID','cards');")
echo "$P2"

echo
echo "### [1] 1페이지가 2페이지에 다시 나오지 않는다"
DUP=$(comm -12 <(echo "$P1_IDS" | sort) <(echo "$P2" | sort))
if [ -z "$DUP" ]; then echo "중복 없음 [통과]"; else echo "$DUP"; echo "^^ 중복 [실패]"; FAIL=1; fi

echo
echo "### [2] 같은 as_of면 점수가 한 톨도 안 바뀐다"
ASOF=$(echo "$LAST_TOK" | cut -d'|' -f2-)
if [ "$ASOF" = "$LAST_TOK" ]; then
  echo "토큰에 as_of가 없다 — 고정 전 함수가 물려 있다 [실패]"; FAIL=1
else
  BEFORE=$(Q "select id||' '||split_part(cursor_token,'|',1) from get_feed_v4('$SEED','$SESS',99,'1e9|$ASOF',null,'cards');")
  for id in $P1_IDS; do view "$id" "$OTHER"; done
  AFTER=$(Q "select id||' '||split_part(cursor_token,'|',1) from get_feed_v4('$SEED','$SESS',99,'1e9|$ASOF',null,'cards');")
  if [ "$BEFORE" = "$AFTER" ]; then
    echo "동일 [통과] ($(echo "$BEFORE" | wc -l)행)"
  else
    echo "달라졌다 [실패]"; diff <(echo "$BEFORE") <(echo "$AFTER") | head -20; FAIL=1
  fi
fi

echo
echo "### [3] 옛 형식 커서(| 없음)도 받는다 — 배포 순간 손에 쥔 커서가 안 깨진다"
OLD=$(Q "select count(*) from get_feed_v4('$SEED','$SESS',3,'$(echo "$LAST_TOK" | cut -d'|' -f1)','$LAST_ID','cards');")
if [ "$OLD" -ge 0 ] 2>/dev/null; then echo "${OLD}행 [통과]"; else echo "실패: $OLD"; FAIL=1; fi

echo
echo "### [4] 1페이지(커서 없음)의 as_of는 now()다"
NOWTOK=$(Q "select split_part(cursor_token,'|',2) from get_feed_v4('$SEED','$SESS',1,null,null,'cards');")
DRIFT=$(Q "select abs(extract(epoch from (now() - '$NOWTOK'::timestamptz))) < 5;" 2>/dev/null)
if [ "$DRIFT" = "t" ]; then echo "$NOWTOK [통과]"; else echo "$NOWTOK [실패]"; FAIL=1; fi

echo
if [ "$FAIL" = 0 ]; then echo "=== 전부 통과 ==="; else echo "=== 실패 있음 ==="; fi
exit $FAIL
