import type { CoverFace } from "@ttokttok/shared/cover-design";

/** 편집기가 면마다 들고 있는 것. 렌더러는 `bitmap`만, 폼은 `upload`만 본다. */
export type FaceImage = {
  bitmap: ImageBitmap;
  /** 서버로 보낼 축소본. 저장된 URL을 그대로 쓰는 면은 null. */
  upload: File | null;
  /** 텍스처 키·썸네일·`cover_design.images`에 들어가는 문자열. */
  url: string;
};

export const FACE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** 원본 디코드 한도. 전송본은 아래 치수로 축소되므로 이 값과 무관하다. */
export const FACE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** 전송·보관 치수. 텍스처 캔버스(800×1200)보다 조금 크게 두어 크롭 여유를 남긴다. */
const UPLOAD_MAX_WIDTH = 1200;
const UPLOAD_MAX_HEIGHT = 1800;
/** 서버가 면당 받는 상한(book-cover-images.ts와 같은 값). 축소본은 보통 수백 KB다. */
export const UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;

export const FACE_LABELS: Record<CoverFace, string> = {
  front: "앞표지",
  spine: "책등",
  back: "뒷표지",
};

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/**
 * 파일이면 디코드해 전송용 축소본을 만들고, URL이면(저장된 면) 받아서
 * 디코드만 한다. 몇 MB짜리 원본이 와도 서버로 가는 것은 면당 수백 KB라
 * 서버 액션 본문 4MB를 렌더 PNG와 나눠 쓸 수 있다.
 *
 * 실패는 그대로 던진다 — 호출자가 그 면의 행에 안내를 붙인다.
 */
export async function prepareFaceImage(
  source: File | string,
): Promise<FaceImage> {
  if (typeof source === "string") {
    const response = await fetch(source, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    return { bitmap, upload: null, url: source };
  }
  if (!FACE_IMAGE_TYPES.includes(source.type))
    throw new Error("JPG, PNG, WebP 이미지를 선택해 주세요.");
  if (source.size > FACE_IMAGE_MAX_BYTES)
    throw new Error("10MB 이하 이미지를 선택해 주세요.");
  const original = await createImageBitmap(source);
  const scale = Math.min(
    1,
    UPLOAD_MAX_WIDTH / original.width,
    UPLOAD_MAX_HEIGHT / original.height,
  );
  // 이미 전송 규격 안이면(다시 열 때의 축소본이 그렇다) 재인코딩하지 않는다.
  if (
    scale === 1 &&
    source.type !== "image/png" &&
    source.size <= UPLOAD_MAX_BYTES
  )
    return { bitmap: original, upload: source, url: URL.createObjectURL(source) };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(original.width * scale));
  canvas.height = Math.max(1, Math.round(original.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 처리할 수 없습니다.");
  context.drawImage(original, 0, 0, canvas.width, canvas.height);
  original.close();
  // Safari는 WebP 인코딩이 없어 PNG를 돌려준다 — 그때는 JPEG로 간다.
  let blob = await encode(canvas, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp")
    blob = await encode(canvas, "image/jpeg", 0.86);
  if (!blob) throw new Error("이미지를 처리할 수 없습니다.");
  const upload = new File(
    [blob],
    `cover-face.${blob.type === "image/webp" ? "webp" : "jpg"}`,
    { type: blob.type },
  );
  const bitmap = await createImageBitmap(canvas);
  return { bitmap, upload, url: URL.createObjectURL(upload) };
}

export function releaseFaceImage(face: FaceImage | undefined) {
  if (!face) return;
  face.bitmap.close();
  if (face.url.startsWith("blob:")) URL.revokeObjectURL(face.url);
}
