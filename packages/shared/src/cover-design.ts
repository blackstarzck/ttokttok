import { z } from "zod";

export const COVER_TEMPLATES = [
  { id: "classic", label: "클래식", description: "단정한 테두리와 중앙 제목" },
  { id: "modern", label: "모던", description: "넓은 여백과 선명한 색면" },
  { id: "literary", label: "문학", description: "아치 장식과 차분한 제목" },
  {
    id: "image",
    label: "이미지",
    description: "표지 원본 이미지를 면별로 올립니다",
  },
] as const;

export const COVER_PALETTES = [
  { id: "forest", label: "숲" },
  { id: "navy", label: "밤" },
  { id: "wine", label: "와인" },
] as const;

/** 이미지 템플릿이 받는 면. UI·검증 순서이기도 하다. 앞표지만 필수. */
export const COVER_FACES = ["front", "spine", "back"] as const;
export type CoverFace = (typeof COVER_FACES)[number];

// 저장된 공개 URL 또는 편집 중의 blob: URL. 서버는 이 값을 신뢰하지 않고
// 업로드 결과나 기존 행의 값으로만 확정한다 (게시글 배경과 같은 원칙).
const faceImage = z.string().min(1).max(2048);

// 이미지 안에 들어가는 문구도 보관한다. 서지 정보만 수정했을 때
// 아직 재생성하지 않은 이미지와 편집 설정이 서로 달라지지 않도록 한다.
export const coverDesignSchema = z
  .object({
    version: z.literal(1),
    template: z.enum(["classic", "modern", "literary", "image"]),
    // 이미지 템플릿에서는 쓰이지 않지만 남긴다 — 그린 템플릿으로
    // 되돌릴 때 이전 팔레트가 살아 있어야 한다.
    palette: z.enum(["forest", "navy", "wine"]),
    title: z.string().trim().min(1).max(120),
    author: z.string().trim().min(1).max(80),
    angle: z.number().int().min(-180).max(180),
    tilt: z.number().int().min(-90).max(90).default(8),
    thickness: z.number().int().min(10).max(50),
    images: z
      .object({
        front: faceImage,
        spine: faceImage.optional(),
        back: faceImage.optional(),
      })
      .optional(),
  })
  .refine((design) => design.template !== "image" || !!design.images?.front, {
    message: "앞표지 이미지가 필요합니다.",
    path: ["images", "front"],
  });

export type CoverDesign = z.infer<typeof coverDesignSchema>;
export type CoverImages = NonNullable<CoverDesign["images"]>;

export function defaultCoverDesign(title: string, author: string): CoverDesign {
  return {
    version: 1,
    template: "classic",
    palette: "forest",
    title,
    author,
    angle: 25,
    tilt: 8,
    thickness: 27,
  };
}

export function readCoverDesign(value: unknown): CoverDesign | null {
  const result = coverDesignSchema.safeParse(value);
  return result.success ? result.data : null;
}
