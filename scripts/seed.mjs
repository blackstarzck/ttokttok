/**
 * 개발용 시드 데이터.
 *
 *   node --env-file=.env scripts/seed.mjs
 *
 * 고정 UUID + upsert라 여러 번 돌려도 안전하다.
 * service role 키를 쓰므로 RLS를 우회한다 — 로컬/개발 환경에서만 실행할 것.
 *
 * 도서는 전부 저작권 만료(사후 70년 경과) 한국 근대문학이다.
 * cover_url / epub_path는 비워 둔다. 실제 파일은 어드민에서 업로드하며,
 * 커버가 없는 동안 피드는 타이포그래피 폴백으로 렌더한다.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: node --env-file=.env scripts/seed.mjs",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 고정 ID (재실행 시 같은 행을 갱신하기 위함) ──────────────────
const ch = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const bk = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const po = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;

// ── 채널: 장르별 큐레이션 페르소나 ──────────────────────────────
const channels = [
  {
    id: ch(1),
    name: "밤의 문장들",
    slug: "night-sentences",
    genre: "소설",
    description: "잠들기 전 한 편. 짧지만 오래 남는 이야기.",
  },
  {
    id: ch(2),
    name: "경성 모던",
    slug: "gyeongseong-modern",
    genre: "근대문학",
    description: "1930년대 경성의 감각. 지금 읽어도 낯설게 새로운 문장.",
  },
  {
    id: ch(3),
    name: "시 한 잔",
    slug: "poem-a-cup",
    genre: "시",
    description: "하루에 시 한 편. 천천히 마시는 문장.",
  },
];

// ── 도서 ────────────────────────────────────────────────────────
const books = [
  {
    id: bk(1),
    channel: ch(1),
    title: "운수 좋은 날",
    author: "현진건",
    category: "소설",
    intro:
      "비 오는 날 인력거꾼 김첨지에게 유난히 손님이 많이 붙는다. 벌이가 좋을수록 커지는 불안, 그리고 집으로 돌아가는 길.",
    toc: ["운수 좋은 날", "빈처", "B사감과 러브레터", "고향", "술 권하는 사회"],
    pageCount: 168,
    pubDate: "1924-06-01",
    hook: {
      title: "오늘은 운수가 좋다, 너무 좋다",
      desc: "행운이 계속될수록 불안해지는 하루. 한국 단편의 아이러니가 여기서 시작됐다.",
    },
    quote: {
      text: "설렁탕을 사다 놓았는데 왜 먹지를 못하니, 왜 먹지를 못하니…",
      from: "운수 좋은 날 중에서",
    },
  },
  {
    id: bk(2),
    channel: ch(1),
    title: "봄봄",
    author: "김유정",
    category: "소설",
    intro:
      "점순이와 혼인시켜 준다는 말만 믿고 삼 년째 데릴사위로 일하는 '나'. 장인은 오늘도 키가 덜 자랐다고 한다.",
    toc: ["봄봄", "동백꽃", "금 따는 콩밭", "만무방", "소낙비"],
    pageCount: 204,
    pubDate: "1935-12-01",
    hook: {
      title: "장인님, 이제 저 좀 성례시켜 주세요",
      desc: "웃다가 서글퍼지는 김유정 특유의 해학. 90년 전 문장인데 리듬이 살아 있다.",
    },
    quote: {
      text: "이놈아! 아직 멀었어. 점순이 키가 이만큼은 더 커야지.",
      from: "봄봄 중에서",
    },
  },
  {
    id: bk(3),
    channel: ch(1),
    title: "메밀꽃 필 무렵",
    author: "이효석",
    category: "소설",
    intro:
      "장돌뱅이 허 생원이 달빛 아래 봉평 길을 걸으며 평생 단 한 번의 밤을 이야기한다.",
    toc: ["메밀꽃 필 무렵", "돈", "산", "들"],
    pageCount: 152,
    pubDate: "1936-10-01",
    hook: {
      title: "달빛에 소금을 뿌린 듯한 밤",
      desc: "한국어로 쓰인 가장 아름다운 풍경 묘사를 꼽으라면, 대개 이 문단이 나온다.",
    },
    quote: {
      text: "산허리는 온통 메밀밭이어서 피기 시작한 꽃이 소금을 뿌린 듯이 흐뭇한 달빛에 숨이 막힐 지경이다.",
      from: "메밀꽃 필 무렵 중에서",
    },
  },
  {
    id: bk(4),
    channel: ch(1),
    title: "벙어리 삼룡이",
    author: "나도향",
    category: "소설",
    intro:
      "말 못 하는 하인 삼룡이가 주인집 새아씨를 향해 품은 마음. 끝내 말이 되지 못한 감정의 기록.",
    toc: ["벙어리 삼룡이", "물레방아", "뽕"],
    pageCount: 136,
    pubDate: "1925-07-01",
    hook: {
      title: "말할 수 없어서 더 뜨거웠던",
      desc: "1925년의 소설이 이렇게까지 현대적인 감정을 다뤘다는 게 놀랍다.",
    },
    quote: {
      text: "그는 말을 할 수 없었다. 다만 그의 눈이 모든 것을 말하고 있었다.",
      from: "벙어리 삼룡이 중에서",
    },
  },
  {
    id: bk(5),
    channel: ch(2),
    title: "날개",
    author: "이상",
    category: "소설",
    intro:
      "아내의 방 뒤에 붙어사는 '나'. 방 안에서 세계를 잃어가다가, 미쓰코시 옥상에서 문득 겨드랑이가 가렵다.",
    toc: ["날개", "봉별기", "종생기", "권태"],
    pageCount: 188,
    pubDate: "1936-09-01",
    hook: {
      title: "날개야 다시 돋아라",
      desc: "한국 모더니즘 소설의 출발점. 처음 읽으면 어렵고, 다시 읽으면 무섭다.",
    },
    quote: {
      text: "날개야 다시 돋아라. 날자. 날자. 날자. 한 번만 더 날자꾸나.",
      from: "날개 중에서",
    },
  },
  {
    id: bk(6),
    channel: ch(2),
    title: "태평천하",
    author: "채만식",
    category: "소설",
    intro:
      "만석꾼 윤직원 영감은 이 시대를 태평천하라 부른다. 그 말이 나올 때마다 독자는 서늘해진다.",
    toc: [
      "1장 윤직원 영감 봉변기",
      "2장 무임승차 기술",
      "3장 서양국 명배우",
      "4장 우리 만수 동이",
      "5장 마음의 빈민굴",
      "6장 관전기",
      "7장 쇠가 쇠를 낳고",
      "8장 상평통보 서 푼",
      "9장 절약의 도락 정신",
      "10장 태평천하",
    ],
    pageCount: 312,
    pubDate: "1938-01-01",
    hook: {
      title: "이 좋은 세상에, 태평천하에",
      desc: "칭찬처럼 들리는 문장으로 시대를 조롱하는 법. 풍자의 교과서.",
    },
    quote: {
      text: "그런디 세상이 다 태평천하지, 태평천하여!",
      from: "태평천하 중에서",
    },
  },
  {
    id: bk(7),
    channel: ch(3),
    title: "하늘과 바람과 별과 시",
    author: "윤동주",
    category: "시",
    intro:
      "부끄러움을 견디며 쓴 시들. 스물여덟에 멈춘 목소리가 아직 또렷하다.",
    toc: ["서시", "자화상", "별 헤는 밤", "쉽게 씌어진 시", "참회록", "십자가"],
    pageCount: 124,
    pubDate: "1948-01-30",
    hook: {
      title: "죽는 날까지 하늘을 우러러",
      desc: "누구나 첫 줄은 안다. 그런데 끝까지 읽어본 사람은 의외로 적다.",
    },
    quote: {
      text: "죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를, 잎새에 이는 바람에도 나는 괴로워했다.",
      from: "서시",
    },
  },
  {
    id: bk(8),
    channel: ch(3),
    title: "진달래꽃",
    author: "김소월",
    category: "시",
    intro:
      "떠나는 사람의 앞길에 꽃을 뿌리겠다는 말. 체념인지 사랑인지 백 년째 논쟁 중이다.",
    toc: ["진달래꽃", "먼 후일", "산유화", "초혼", "엄마야 누나야", "왕십리"],
    pageCount: 148,
    pubDate: "1925-12-26",
    hook: {
      title: "말없이 고이 보내 드리오리다",
      desc: "교과서에서 외웠던 시를, 이제 자기 속도로 다시 읽을 시간.",
    },
    quote: {
      text: "나 보기가 역겨워 가실 때에는 말없이 고이 보내 드리오리다.",
      from: "진달래꽃",
    },
  },
];

// ── 실행 ────────────────────────────────────────────────────────
async function run() {
  // 1) 채널
  {
    const { error } = await db.from("channels").upsert(
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        genre: c.genre,
        description: c.description,
      })),
    );
    if (error) throw new Error(`channels: ${error.message}`);
    console.log(`✓ 채널 ${channels.length}개`);
  }

  // 2) 도서 — 전부 저작권 만료작이므로 access_type='full'
  {
    const { error } = await db.from("books").upsert(
      books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        publisher: null,
        category: b.category,
        intro: b.intro,
        toc: b.toc,
        page_count: b.pageCount,
        pub_date_paper: b.pubDate,
        access_type: "full",
        preview_chapter_limit: 1,
      })),
    );
    if (error) throw new Error(`books: ${error.message}`);
    console.log(`✓ 도서 ${books.length}권 (전부 저작권 만료작, access_type=full)`);
  }

  // 3) 게시물 — 도서당 1개. 피드 정렬 확인용으로 카운터를 흩어 놓는다.
  //    (앱에서는 카운터를 직접 쓰지 않는다. 시드만 예외.)
  const posts = books.map((b, i) => ({
    id: po(i + 1),
    channel_id: b.channel,
    book_id: b.id,
    type: "cards",
    status: "published",
    published_at: new Date(Date.UTC(2026, 7, 20 + i, 9, 0, 0)).toISOString(),
    like_count: [312, 89, 1204, 47, 876, 23, 2140, 655][i],
    view_count: [4300, 1200, 18700, 640, 9800, 310, 31400, 8900][i],
    share_count: [21, 4, 96, 2, 51, 1, 188, 43][i],
  }));

  {
    const { error } = await db.from("posts").upsert(posts);
    if (error) throw new Error(`posts: ${error.message}`);
    console.log(`✓ 게시물 ${posts.length}개 (전부 published)`);
  }

  // 4) 카드 — 게시물당 [a 훅 → c 인용 → b 상세] 3장.
  //    카드는 id를 관리하지 않고 지웠다 다시 넣는다.
  {
    const postIds = posts.map((p) => p.id);
    const { error: delErr } = await db
      .from("post_cards")
      .delete()
      .in("post_id", postIds);
    if (delErr) throw new Error(`post_cards delete: ${delErr.message}`);

    const cards = books.flatMap((b, i) => [
      {
        post_id: po(i + 1),
        sort_order: 0,
        template_category: "a",
        body: { "title-01": b.hook.title, "description-01": b.hook.desc },
      },
      {
        post_id: po(i + 1),
        sort_order: 1,
        template_category: "c",
        body: { "description-01": b.quote.text, "caption-01": b.quote.from },
      },
      {
        post_id: po(i + 1),
        sort_order: 2,
        template_category: "b",
        body: { "title-01": "상세 정보" },
      },
    ]);

    const { error } = await db.from("post_cards").insert(cards);
    if (error) throw new Error(`post_cards: ${error.message}`);
    console.log(`✓ 카드 ${cards.length}장 (게시물당 a→c→b)`);
  }

  // 5) 탐색 '오늘의 추천'
  {
    const featured = [bk(7), bk(3), bk(5)].map((book_id, i) => ({
      book_id,
      sort_order: i,
      active: true,
    }));
    const { error } = await db.from("featured_books").upsert(featured);
    if (error) throw new Error(`featured_books: ${error.message}`);
    console.log(`✓ 오늘의 추천 ${featured.length}권`);
  }

  // 6) 금칙어 — 최소 세트. 운영 중에는 어드민에서 관리한다.
  {
    const words = ["씨발", "병신", "좆", "새끼"].map((word) => ({ word }));
    const { error } = await db
      .from("banned_words")
      .upsert(words, { onConflict: "word", ignoreDuplicates: true });
    if (error) throw new Error(`banned_words: ${error.message}`);
    console.log(`✓ 금칙어 ${words.length}개`);
  }

  // 7) 관리자 승격 — ADMIN_EMAIL 계정이 이미 로그인한 적 있어야 한다.
  {
    const email = process.env.ADMIN_EMAIL;
    if (!email) {
      console.log("· ADMIN_EMAIL 없음 — 관리자 승격 건너뜀");
    } else {
      const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw new Error(`listUsers: ${error.message}`);

      const user = data.users.find((u) => u.email === email);
      if (!user) {
        console.log(
          `· ${email} 계정 없음 — 소셜 로그인을 한 번 한 뒤 다시 실행하면 관리자로 승격된다`,
        );
      } else {
        const { error: upErr } = await db
          .from("profiles")
          .update({ role: "admin" })
          .eq("id", user.id);
        if (upErr) throw new Error(`profiles: ${upErr.message}`);
        console.log(`✓ 관리자 승격: ${email}`);
      }
    }
  }

  console.log("\n시드 완료.");
}

run().catch((err) => {
  console.error("\n✗ 시드 실패:", err.message);
  process.exit(1);
});
