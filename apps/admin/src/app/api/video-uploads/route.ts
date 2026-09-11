import { readAdminAccess } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVideoManifest, validateVideoPlaylist } from "@ttokttok/shared/video-bundle";
import type { Json } from "@ttokttok/database/types";

export async function POST(request: Request) {
  const access = await readAdminAccess();
  if (!access?.isAdmin) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  // These cookie-authenticated mutations are only accepted from our own page.
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "잘못된 요청입니다." }, { status: 403 });
  const db = createAdminClient();
  try {
    const raw = await request.text();
    if (raw.length > 512000) throw new Error("업로드 정보가 너무 큽니다.");
    const body = JSON.parse(raw);
    if (body.action === "start") {
      const manifest = parseVideoManifest(body.manifest);
      const id = crypto.randomUUID();
      const prefix = `bundles/${id}`;
      const base = db.storage.from("videos").getPublicUrl(prefix).data.publicUrl;
      const { error } = await db.from("video_uploads").insert({ id, created_by: access.userId, manifest: manifest as unknown as Json, public_base: base });
      if (error) throw error;
      return Response.json({ id, prefix, base });
    }
    if (!/^[0-9a-f-]{36}$/.test(body.id ?? "")) throw new Error("잘못된 업로드 ID입니다.");
    const { data: upload, error } = await db.from("video_uploads").select("*").eq("id", body.id).single();
    if (error) throw error;
    const manifest = parseVideoManifest(upload.manifest);
    const prefix = `bundles/${upload.id}`;
    if (body.action === "cleanup") {
      const { data: claimed, error: claimError } = await db.rpc("claim_video_cleanup", { p_id: upload.id });
      if (claimError) throw claimError;
      if (!claimed) throw new Error("현재 게시물에서 사용 중인 영상은 삭제할 수 없습니다.");
      const paths = manifest.files.map(f => `${prefix}/${f.path}`);
      for (let i = 0; i < paths.length; i += 100) {
        const { error: removeError } = await db.storage.from("videos").remove(paths.slice(i, i + 100));
        if (removeError) throw removeError;
      }
      const { error: deleteError } = await db.from("video_uploads").delete().eq("id", upload.id);
      if (deleteError) throw deleteError;
      return Response.json({ ok: true });
    }
    if (body.action !== "complete" || upload.status === "deleting") throw new Error("처리할 수 없는 업로드입니다.");
    // List actual storage metadata, not client-supplied URLs or progress flags.
    const directories = [...new Set(manifest.files.map(f => f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ""))];
    const actual = new Map<string, number>();
    for (const dir of directories) {
      for (let offset = 0; ; offset += 100) {
        const { data, error: listError } = await db.storage.from("videos").list(`${prefix}${dir ? `/${dir}` : ""}`, { limit: 100, offset });
        if (listError) throw listError;
        for (const f of data) if (f.id) actual.set(`${dir ? `${dir}/` : ""}${f.name}`, Number(f.metadata?.size));
        if (data.length < 100) break;
      }
    }
    for (const f of manifest.files) {
      if (actual.get(f.path) !== f.size) throw new Error(`업로드 누락 또는 크기 불일치: ${f.path}`);
    }
    for (const f of manifest.files.filter(f => f.path.endsWith(".m3u8"))) {
      if (f.size > 256000) throw new Error("재생 목록이 너무 큽니다.");
      const { data, error: downloadError } = await db.storage.from("videos").download(`${prefix}/${f.path}`);
      if (downloadError) throw downloadError;
      validateVideoPlaylist(f.path, await data.text(), manifest);
    }
    const { error: readyError } = await db.from("video_uploads").update({ status: "ready" }).eq("id", upload.id).eq("status", "uploading");
    if (readyError) throw readyError;
    return Response.json({ ok: true, base: upload.public_base });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "영상 처리에 실패했습니다." }, { status: 400 });
  }
}
