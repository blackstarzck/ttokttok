import "server-only";
import sharp from "sharp";
import { createAdminClient } from "./supabase/admin";
import {
  COVER_FACES,
  type CoverDesign,
  type CoverFace,
  type CoverImages,
} from "@ttokttok/shared/cover-design";
import { pathFromPublicUrl } from "@ttokttok/shared/storage-path";
import type { UploadedFile } from "./admin-storage";

/** 면당 상한 — 편집기가 1200×1800 안으로 축소한 뒤 보내므로 보통 수백 KB다. */
const FACE_MAX_BYTES = 1.5 * 1024 * 1024;
const FACE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class CoverImageError extends Error {}

/**
 * 이미지 템플릿의 면 원본을 확정한다.
 *
 * 폼의 주소(`design.images`)는 신뢰하지 않는다 — 면마다 **새 파일이 있으면
 * 검증·축소해 올린 결과**, 없으면 **기존 행의 같은 면 주소와 일치할 때만**
 * 그대로 둔다(게시글 배경 `preparePostBackground`와 같은 원칙). 앞표지는
 * 둘 중 하나가 있어야 한다.
 *
 * 검증은 업로드 전에 전부 끝낸다 — 한 면이 틀렸다고 다른 면의 파일이
 * 버킷에 먼저 남아선 안 된다. 올린 파일은 `uploaded`에 적어 실패 시
 * 호출자가 회수한다.
 */
export async function prepareCoverImages(
  form: FormData,
  design: CoverDesign,
  previous: unknown,
  bookId: string,
  uploaded: UploadedFile[],
): Promise<CoverImages> {
  const kept = savedImages(previous);
  const pending: Partial<Record<CoverFace, Buffer>> = {};
  const images: Partial<CoverImages> = {};
  for (const face of COVER_FACES) {
    const file = form.get(`cover_image_${face}`);
    if (file instanceof File && file.size > 0) {
      pending[face] = await encodeFace(file);
    } else {
      const url = design.images?.[face];
      if (url && url === kept?.[face]) images[face] = url;
    }
  }
  if (!pending.front && !images.front)
    throw new CoverImageError("앞표지 이미지를 다시 올려 주세요.");

  const storage = createAdminClient().storage.from("covers");
  for (const face of COVER_FACES) {
    const buffer = pending[face];
    if (!buffer) continue;
    const path = `${bookId}/design-${face}-${crypto.randomUUID()}.webp`;
    const { error } = await storage.upload(path, buffer, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error)
      throw new CoverImageError(`표지 이미지 업로드 실패: ${error.message}`);
    uploaded.push({ bucket: "covers", path });
    images[face] = storage.getPublicUrl(path).data.publicUrl;
  }
  return images as CoverImages;
}

async function encodeFace(file: File): Promise<Buffer> {
  if (file.size > FACE_MAX_BYTES || !FACE_TYPES.includes(file.type))
    throw new CoverImageError(
      "표지 면 이미지는 1.5MB 이하 JPG, PNG, WebP여야 합니다. 3D 표지를 다시 열어 적용해 주세요.",
    );
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    });
    const metadata = await source.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
      throw new Error("format");
    return await source
      .rotate()
      .resize({
        width: 1200,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new CoverImageError(
      "표지 면 이미지를 읽을 수 없습니다. 다른 JPG, PNG, WebP 파일을 선택해 주세요.",
    );
  }
}

/** 저장된 `cover_design`에서 면 주소만 — 스키마 전체를 검증하지 않는다(옛 행도 읽어야 한다). */
function savedImages(value: unknown): Partial<Record<CoverFace, string>> | null {
  if (!value || typeof value !== "object") return null;
  const images = (value as { images?: unknown }).images;
  if (!images || typeof images !== "object") return null;
  const result: Partial<Record<CoverFace, string>> = {};
  for (const face of COVER_FACES) {
    const url = (images as Record<string, unknown>)[face];
    if (typeof url === "string" && /^https?:\/\//.test(url)) result[face] = url;
  }
  return result;
}

/**
 * 이 도서 폴더 안의 면 원본 파일들. 다른 도서·다른 종류의 주소는 걸러낸다 —
 * 삭제에 쓰이는 값이라 조용한 오해가 남의 파일을 지울 수 있다.
 */
export function coverImageFiles(value: unknown, bookId: string): UploadedFile[] {
  const images = savedImages(value);
  if (!images) return [];
  const files: UploadedFile[] = [];
  for (const face of COVER_FACES) {
    const path = pathFromPublicUrl(images[face], "covers");
    if (path?.startsWith(`${bookId}/design-`)) files.push({ bucket: "covers", path });
  }
  return files;
}
