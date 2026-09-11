import { z } from "zod";

export const COVER_TEMPLATES = [
  { id: "classic", label: "클래식", description: "단정한 테두리와 중앙 제목" },
  { id: "modern", label: "모던", description: "넓은 여백과 선명한 색면" },
  { id: "literary", label: "문학", description: "아치 장식과 차분한 제목" },
] as const;

export const COVER_PALETTES = [
  { id: "forest", label: "숲" },
  { id: "navy", label: "밤" },
  { id: "wine", label: "와인" },
] as const;

// 이미지 안에 들어가는 문구도 보관한다. 서지 정보만 수정했을 때
// 아직 재생성하지 않은 이미지와 편집 설정이 서로 달라지지 않도록 한다.
export const coverDesignSchema = z.object({
  version: z.literal(1),
  template: z.enum(["classic", "modern", "literary"]),
  palette: z.enum(["forest", "navy", "wine"]),
  title: z.string().trim().min(1).max(120),
  author: z.string().trim().min(1).max(80),
  angle: z.number().int().min(-180).max(180),
  tilt: z.number().int().min(-90).max(90).default(8),
  thickness: z.number().int().min(10).max(50),
});

export type CoverDesign = z.infer<typeof coverDesignSchema>;

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
