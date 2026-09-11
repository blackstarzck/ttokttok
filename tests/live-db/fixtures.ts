import { adminIdToEmail } from "@ttokttok/shared/admin-id";
import { createClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { loadTestEnv } from "./env.ts";

loadTestEnv();
export const ids = {
  channel: "11000000-0000-4000-8000-000000000001",
  book: "22000000-0000-4000-8000-000000000001",
  linkBook: "22000000-0000-4000-8000-000000000002",
  post: "33000000-0000-4000-8000-000000000001",
  linkPost: "33000000-0000-4000-8000-000000000002",
  video: "33000000-0000-4000-8000-000000000003",
  draft: "33000000-0000-4000-8000-000000000004",
};
export const originalHook = "한 문장이 하루를 바꿀 때";
export const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export function publicDb() {
  return createClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function serviceDb() {
  return createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
// "admin"은 owner 등급 픽스처다(admin_accounts.level = 'owner') — 기존
// 인테그레이션 테스트가 이 이름에 이미 의존한다. "staffAdmin"은 비-owner
// 관리자다(level = 'admin') — owner 전용 경계(admin_accounts 쓰기 등)를
// 검증하려면 owner가 아닌 관리자 신원이 필요한데, 그때까지 픽스처에 없었다.
export async function account(role: "admin" | "staffAdmin" | "user") {
  const db = publicDb();
  const { data, error } = await db.auth.signInWithPassword({
    email:
      role === "admin"
        ? adminIdToEmail(process.env.TEST_ADMIN_ID!)
        : role === "staffAdmin"
          ? adminIdToEmail(process.env.TEST_STAFF_ADMIN_ID!)
          : process.env.TEST_USER_EMAIL!,
    password: process.env.TEST_PASSWORD!,
  });
  if (error || !data.session) throw error ?? new Error("No fixture session");
  return { db, session: data.session, user: data.user };
}
export function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

export function fixtureEpub() {
  const body = Array.from(
    { length: 18 },
    (_, i) =>
      `<p>${i + 1}. 오늘도 책장을 펼쳤다. 짧은 문장에서 새로운 생각이 시작되었다. 창밖으로 들어오는 햇빛이 종이 위에 머물렀다. 우리는 천천히 읽으며 서로의 이야기를 이해했다.</p>`,
  ).join("");
  const content = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "OPS/content.opf": strToU8(
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">ttokttok-test</dc:identifier><dc:title>테스트 산책</dc:title><dc:language>ko</dc:language><dc:creator>테스트 작가</dc:creator><meta property="dcterms:modified">2026-09-10T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    ),
    "OPS/chapter.xhtml": strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml" lang="ko"><head><title>첫 번째 산책</title></head><body><h1>첫 번째 산책</h1>${body}</body></html>`,
    ),
    "OPS/nav.xhtml": strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>목차</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">첫 번째 산책</a></li></ol></nav></body></html>',
    ),
  };
  return zipSync(content);
}

export async function seedFixtures() {
  const db = serviceDb();
  check(
    await db
      .from("posts")
      .delete()
      .in("id", [ids.post, ids.linkPost, ids.video, ids.draft]),
  );
  check(
    await db.from("channels").delete().eq("slug", "integration-test-channel"),
  );
  const existing = check(await db.auth.admin.listUsers()).data.users;
  // staffAdmin은 owner가 아닌 관리자다 — owner 전용 경계(admin_accounts
  // 쓰기 등)를 검증하려면 owner가 아닌 관리자 신원이 필요한데, 이 픽스처가
  // 생기기 전에는 테스트 스위트에 그런 신원이 아예 없었다.
  for (const role of ["admin", "staffAdmin", "user"] as const) {
    const isAdminRole = role === "admin" || role === "staffAdmin";
    // 관리자는 라우팅되지 않는 합성 이메일을 쓴다 — 사용자와 신원 공간이
    // 겹치지 않는다는 것이 이 설계의 요점이다.
    const email =
      role === "admin"
        ? adminIdToEmail(process.env.TEST_ADMIN_ID!)
        : role === "staffAdmin"
          ? adminIdToEmail(process.env.TEST_STAFF_ADMIN_ID!)
          : process.env.TEST_USER_EMAIL!;
    const found = existing.find((user) => user.email === email);
    const user =
      found ??
      check(
        await db.auth.admin.createUser({
          email,
          password: process.env.TEST_PASSWORD!,
          email_confirm: true,
          app_metadata: isAdminRole ? { ttokttok_admin: true } : {},
          user_metadata: {
            name:
              role === "admin"
                ? "테스트 관리자"
                : role === "staffAdmin"
                  ? "테스트 스태프 관리자"
                  : "테스트 독자",
          },
        }),
      ).data.user;
    if (!user) throw new Error("Fixture user missing");

    if (isAdminRole) {
      // 트리거의 건너뛰기는 이 경로에서 먹지 않는다 — GoTrue가 app_metadata를
      // INSERT 이후에 붙여 트리거가 볼 때는 표식이 없다. 여기서 지우는 것이
      // 관리자에게 프로필이 생기지 않게 하는 실질적 방어다 (마이그레이션 주석).
      check(await db.from("profiles").delete().eq("id", user.id));
      check(
        await db.from("admin_accounts").upsert({
          id: user.id,
          name: role === "admin" ? "테스트 관리자" : "테스트 스태프 관리자",
          level: role === "admin" ? "owner" : "admin",
          is_active: true,
        }),
      );
    } else {
      check(
        await db
          .from("profiles")
          .update({ nickname: "테스트 독자" })
          .eq("id", user.id),
      );
      // Only this test account's interactions are reset; never reset the database.
      for (const table of ["likes", "bookmarks", "reading_progress", "comments"])
        check(await db.from(table).delete().eq("user_id", user.id));
    }
  }
  // 채널 홈 히어로가 주 경로(사진 커버)를 찍도록 단색 PNG를 만들어 올린다.
  mkdirSync(".tmp/test-assets", { recursive: true });
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x3b5a6f:s=720x960:d=1",
    "-frames:v",
    "1",
    ".tmp/test-assets/channel-cover.png",
  ]);
  check(
    await db.storage
      .from("covers")
      .upload("tests/channel-cover.png", readFileSync(".tmp/test-assets/channel-cover.png"), {
        contentType: "image/png",
        upsert: true,
      }),
  );
  const coverUrl = db.storage.from("covers").getPublicUrl("tests/channel-cover.png")
    .data.publicUrl;
  check(
    await db
      .from("channels")
      .upsert({
        id: ids.channel,
        name: "산책하는 문장",
        slug: "test-walk",
        genre: "소설",
        description: "매일 새로운 책을 만나는 시간",
        cover_url: coverUrl,
      }),
  );
  check(
    await db.storage
      .from("epubs")
      .upload("tests/walk.epub", fixtureEpub(), {
        contentType: "application/epub+zip",
        upsert: true,
      }),
  );
  check(
    await db.from("books").upsert([
      {
        id: ids.book,
        title: "테스트 산책",
        author: "테스트 작가",
        category: "소설",
        publisher: "똑똑 출판",
        intro: "한 문장을 따라 천천히 걸으며 세상을 만나는 이야기입니다.",
        toc: ["첫 번째 산책"],
        quote: "책장을 펼치면 새로운 길이 시작된다.",
        epub_path: "tests/walk.epub",
        source: "manual",
        rights_note: "직접 작성한 테스트 문장",
        page_count: 100,
        isbn: null,
      },
      {
        id: ids.linkBook,
        title: "테스트 서점",
        author: "테스트 작가",
        category: "에세이",
        publisher: "똑똑 출판",
        intro: "서점에서 만나는 일상 속 작은 이야기입니다.",
        toc: ["책을 만나다"],
        epub_path: null,
        isbn: "9788936434267",
      },
    ]),
  );
  check(
    await db.from("posts").upsert([
      {
        id: ids.post,
        channel_id: ids.channel,
        book_id: ids.book,
        type: "cards",
        status: "published",
        published_at: "2026-09-09T00:00:00Z",
      },
      {
        id: ids.linkPost,
        channel_id: ids.channel,
        book_id: ids.linkBook,
        type: "cards",
        status: "published",
        published_at: "2026-09-08T00:00:00Z",
      },
      {
        id: ids.video,
        channel_id: ids.channel,
        book_id: ids.book,
        type: "video",
        status: "published",
        published_at: "2026-09-07T00:00:00Z",
      },
      {
        id: ids.draft,
        channel_id: ids.channel,
        book_id: ids.book,
        type: "cards",
        status: "draft",
        published_at: null,
      },
    ]),
  );
  for (const [postId, hook] of [
    [ids.post, originalHook],
    [ids.linkPost, "일상에 책 한 권을 더하다"],
    [ids.draft, "아직 발행하지 않은 문장"],
  ]) {
    check(
      await db
        .from("post_cards")
        .upsert({
          post_id: postId,
          template: "a",
          regions: {
            cover: { variant: "a" },
            genre: { variant: "a" },
            biblio: { variant: "a" },
            hook: { variant: "a", text: hook },
            desc: { variant: "a", text: "잠깐의 독서로 시작하는 새로운 하루" },
          },
        }),
    );
  }
  mkdirSync(".tmp/test-assets", { recursive: true });
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x273b42:s=360x640:d=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    ".tmp/test-assets/video.mp4",
  ]);
  check(
    await db.storage
      .from("videos")
      .upload("tests/walk.mp4", readFileSync(".tmp/test-assets/video.mp4"), {
        contentType: "video/mp4",
        upsert: true,
      }),
  );
  const videoUrl = db.storage.from("videos").getPublicUrl("tests/walk.mp4")
    .data.publicUrl;
  check(
    await db
      .from("post_videos")
      .upsert({
        post_id: ids.video,
        source_type: "upload",
        video_path: videoUrl,
        duration_sec: 3,
      }),
  );
  check(
    await db
      .from("featured_books")
      .upsert({ book_id: ids.book, sort_order: 0, active: true }),
  );
  console.log("Isolated test fixtures ready.");
}
