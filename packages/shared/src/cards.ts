import type { FeedCardLayout } from './feed';

export type RegionSchema = { label: string; input: 'text' | 'textarea' | null; required: boolean; maxLength?: number; defaultVariant: string; variants: Record<string, { label: string }> };

export const REGION_SCHEMA: Record<string, RegionSchema> = {
  "cover": {
    "label": "도서 커버",
    "input": null,
    "required": false,
    "defaultVariant": "a",
    "variants": {
      "a": {
        "label": "중앙 표준"
      },
      "b": {
        "label": "좌측 소형"
      }
    }
  },
  "genre": {
    "label": "장르",
    "input": null,
    "required": false,
    "defaultVariant": "a",
    "variants": {
      "a": {
        "label": "캡션"
      },
      "b": {
        "label": "헤드라인"
      }
    }
  },
  "biblio": {
    "label": "서지 (도서명·출판사·저자/옮긴이)",
    "input": null,
    "required": false,
    "defaultVariant": "a",
    "variants": {
      "a": {
        "label": "중앙"
      },
      "b": {
        "label": "좌측"
      }
    }
  },
  "hook": {
    "label": "훅",
    "input": "text",
    "required": true,
    "maxLength": 60,
    "defaultVariant": "a",
    "variants": {
      "a": {
        "label": "중앙 강조"
      },
      "b": {
        "label": "좌측"
      }
    }
  },
  "desc": {
    "label": "부연 설명",
    "input": "textarea",
    "required": false,
    "maxLength": 90,
    "defaultVariant": "a",
    "variants": {
      "a": {
        "label": "중앙"
      },
      "b": {
        "label": "좌측"
      }
    }
  }
};

export type PostTemplate = {
  label: string;
  /** 영역 구성과 순서. 템플릿이 고정하며 관리자는 못 바꾼다. */
  regions: readonly string[];
};

export const POST_TEMPLATES: Record<string, PostTemplate> = {
  // 저장된 템플릿 키는 유지하되 중복 표지와 서지는 하단 도서 바에 맡긴다.
  a: {
    label: "문장 중심",
    regions: ["hook", "desc"],
  },
  // 커버 없는 텍스트 중심 — 하단 도서 바가 커버를 이미 보여준다.
  b: {
    label: "장르 포함",
    regions: ["genre", "hook", "desc"],
  },
};

/** 필수 텍스트가 아직 빈 영역들. 미리보기 자리표시와 발행 검증이 같이 쓴다. */
export function missingRequiredInputs(layout: FeedCardLayout): string[] {
  const template = POST_TEMPLATES[layout.template];
  if (!template) return [];

  return template.regions.filter((key) => {
    const entry = REGION_SCHEMA[key];
    if (!entry?.input || !entry.required) return false;
    const text = layout.regions?.[key]?.text;
    return typeof text !== "string" || text.trim() === "";
  });
}

/**
 * 이 카드가 사용자 화면에 나갈 수 있는가.
 *
 * 알 수 없는 템플릿이거나 필수 입력이 비면 피드에서 스킵된다 — 카드
 * 하나 때문에 피드 전체를 죽이지 않는다는 규약(FRONTEND.md §3)의 새 형태.
 */
export function isRenderableCard(layout: FeedCardLayout | null): boolean {
  if (!layout || !(layout.template in POST_TEMPLATES)) return false;
  return missingRequiredInputs(layout).length === 0;
}
