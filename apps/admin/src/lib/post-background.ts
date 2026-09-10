import "server-only";
import sharp from "sharp";
import { createAdminClient } from "./supabase/admin";
import { BACKGROUND_IMAGE_MAX_BYTES, BACKGROUND_IMAGE_TYPES, parseCardBackground, resolveCardBackground } from "@ttokttok/shared/card-background";
import { pathFromPublicUrl } from "@ttokttok/shared/storage-path";
import type { UploadedFile } from "./admin-storage";

export function backgroundFile(value: unknown, postId: string): UploadedFile | null {
  const path = pathFromPublicUrl(resolveCardBackground(value).imageUrl, "covers");
  return path?.startsWith(`post-backgrounds/${postId}/`) ? { bucket: "covers", path } : null;
}

/** 새 파일은 고유 경로에 저장한다. 저장 실패 시 기존 배경을 덮어쓰지 않는다. */
export async function preparePostBackground(form: FormData, previous: unknown, postId: string) {
  const raw = form.get("background");
  const background = parseCardBackground(raw ? JSON.parse(String(raw)) : resolveCardBackground(previous));
  let uploaded: UploadedFile | null = null;
  if (background.type === "solid") return { background, uploaded };

  const file = form.get("background-image");
  if (file instanceof File && file.size > 0) {
    if (file.size > BACKGROUND_IMAGE_MAX_BYTES || !BACKGROUND_IMAGE_TYPES.includes(file.type))
      throw new Error("배경은 3MB 이하 JPG, PNG, WebP 이미지로 첨부해 주세요.");
    let buffer: Buffer;
    try {
      const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
      const metadata = await source.metadata();
      if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new Error("format");
      buffer = await source.rotate().resize({ width: 1440, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer();
    } catch {
      throw new Error("이미지를 읽을 수 없습니다. 다른 JPG, PNG, WebP 파일을 선택해 주세요.");
    }
    const path = `post-backgrounds/${postId}/${crypto.randomUUID()}.webp`;
    const storage = createAdminClient().storage.from("covers");
    const { error } = await storage.upload(path, buffer, { contentType: "image/webp", upsert: false });
    if (error) throw new Error(`배경 업로드 실패: ${error.message}`);
    uploaded = { bucket: "covers", path };
    background.imageUrl = storage.getPublicUrl(path).data.publicUrl;
  } else if (form.get("remove-background-image") !== "1") {
    background.imageUrl = resolveCardBackground(previous).imageUrl;
  }
  if (!background.imageUrl) throw new Error("배경 이미지를 첨부하거나 단색을 선택해 주세요.");
  return { background, uploaded };
}
