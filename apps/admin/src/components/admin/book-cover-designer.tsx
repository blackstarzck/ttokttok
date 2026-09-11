"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import {
  COVER_FACES,
  COVER_PALETTES,
  COVER_TEMPLATES,
  coverDesignSchema,
  type CoverDesign,
  type CoverFace,
} from "@ttokttok/shared/cover-design";
import {
  createBookCoverRenderer,
  type CoverBitmaps,
  type CoverColors,
} from "@/lib/book-cover-renderer";
import {
  FACE_IMAGE_TYPES,
  FACE_LABELS,
  prepareFaceImage,
  releaseFaceImage,
  type FaceImage,
} from "@/lib/cover-face-image";

type Faces = Partial<Record<CoverFace, FaceImage>>;
/** 면마다 "불러오는 중"이거나 실패 문구. 성공하면 항목이 사라진다. */
type FaceStatus = Partial<Record<CoverFace, "loading" | string>>;

/** 면 파일이 있으면 그것으로, 없으면 저장된 주소로 — 폼 상태에 남은 blob: 주소는 이미 해제됐을 수 있다. */
function faceSource(
  design: CoverDesign,
  files: Partial<Record<CoverFace, File>> | undefined,
  face: CoverFace,
): File | string | null {
  const file = files?.[face];
  if (file) return file;
  const url = design.images?.[face];
  return url && !url.startsWith("blob:") ? url : null;
}

export function BookCoverDesigner({
  initialDesign,
  initialFaces,
  onApply,
  onCancel,
}: {
  initialDesign: CoverDesign;
  /** 직전 적용에서 올린 면 파일. 다시 열 때 재디코드한다. */
  initialFaces?: Partial<Record<CoverFace, File>>;
  onApply: (
    file: File,
    design: CoverDesign,
    faceUploads: Partial<Record<CoverFace, File>>,
  ) => void;
  onCancel: () => void;
}) {
  const [design, setDesign] = useState(initialDesign);
  const [faces, setFaces] = useState<Faces>({});
  const [faceStatus, setFaceStatus] = useState<FaceStatus>({});
  const [colors, setColors] = useState<CoverColors | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const facesRef = useRef<Faces>({});
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    angle: number;
    tilt: number;
  } | null>(null);
  const renderer = useRef<ReturnType<typeof createBookCoverRenderer> | null>(
    null,
  );

  useEffect(() => {
    let disposed = false;
    const element = canvas.current!;
    const onContextLost = () => {
      setReady(false);
      setError("그래픽 연결이 끊겼습니다. 편집을 닫고 다시 열어 주세요.");
    };
    element.addEventListener("webglcontextlost", onContextLost);
    async function initialize() {
      try {
        const font = getComputedStyle(element)
          .getPropertyValue("--font-sans")
          .trim();
        await document.fonts.load(`700 96px ${font}`, "도서 제목 저자");
        if (disposed) return;
        renderer.current = createBookCoverRenderer(element);
        setReady(true);
      } catch {
        if (!disposed)
          setError(
            "3D 미리보기를 시작하지 못했습니다. 브라우저의 그래픽 가속 설정을 확인하거나 표지 이미지 업로드를 이용해 주세요.",
          );
      }
    }
    void initialize();
    return () => {
      disposed = true;
      element.removeEventListener("webglcontextlost", onContextLost);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  // 면 이미지는 이 컴포넌트가 소유한다 — 바뀌거나 닫힐 때 비트맵과 blob: 주소를 놓는다.
  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);
  useEffect(
    () => () => {
      for (const face of COVER_FACES) releaseFaceImage(facesRef.current[face]);
    },
    [],
  );

  function loadFace(face: CoverFace, source: File | string) {
    setFaceStatus((current) => ({ ...current, [face]: "loading" }));
    return prepareFaceImage(source).then(
      (image) => {
        setFaces((current) => {
          releaseFaceImage(current[face]);
          return { ...current, [face]: image };
        });
        setFaceStatus((current) => {
          const next = { ...current };
          delete next[face];
          return next;
        });
      },
      (cause: unknown) => {
        setFaceStatus((current) => ({
          ...current,
          [face]:
            typeof source === "string"
              ? "저장된 이미지를 불러오지 못했습니다. 다시 올려 주세요."
              : cause instanceof Error && cause.message
                ? cause.message
                : "이미지를 읽을 수 없습니다. 다른 파일을 선택해 주세요.",
        }));
      },
    );
  }

  // 저장된 면(다시 편집)이나 직전 적용의 파일을 처음 한 번 불러온다.
  useEffect(() => {
    if (initialDesign.template !== "image") return;
    for (const face of COVER_FACES) {
      const source = faceSource(initialDesign, initialFaces, face);
      if (source) void loadFace(face, source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 한 번
  }, []);

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      try {
        const next = renderer.current?.render(design, bitmaps(faces));
        if (next)
          setColors((current) =>
            current &&
            current.base === next.base &&
            current.ink === next.ink &&
            current.accent === next.accent
              ? current
              : next,
          );
      } catch {
        setError("미리보기를 그리지 못했습니다. 편집을 닫고 다시 열어 주세요.");
        setReady(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [design, faces, ready]);

  const image = design.template === "image";
  const loading = COVER_FACES.some((face) => faceStatus[face] === "loading");
  const canApply = ready && !busy && !loading && (!image || !!faces.front);

  async function apply() {
    const result = coverDesignSchema.safeParse(
      image
        ? {
            ...design,
            images: faces.front
              ? {
                  front: faces.front.url,
                  ...(faces.spine ? { spine: faces.spine.url } : {}),
                  ...(faces.back ? { back: faces.back.url } : {}),
                }
              : undefined,
          }
        : { ...design, images: undefined },
    );
    if (!result.success) {
      setError(
        image && !faces.front
          ? "앞표지 이미지를 올려 주세요."
          : "제목은 1~120자, 저자는 1~80자로 입력해 주세요. 편집을 닫고 서지 정보를 수정할 수 있습니다.",
      );
      return;
    }
    if (!renderer.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await renderer.current.exportImage(
        result.data,
        bitmaps(faces),
      );
      const uploads: Partial<Record<CoverFace, File>> = {};
      if (image)
        for (const face of COVER_FACES) {
          const upload = faces[face]?.upload;
          if (upload) uploads[face] = upload;
        }
      onApply(
        new File([blob], "book-cover.png", { type: "image/png" }),
        result.data,
        uploads,
      );
    } catch {
      setError("이미지를 만들지 못했습니다. 다시 적용해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="3D 표지 편집기"
      className="bg-card border-border rounded-lg border p-4"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="bg-muted relative mx-auto aspect-[2/3] w-full max-w-xs overflow-hidden rounded-lg">
            <canvas
              ref={canvas}
              aria-label={`${design.title || "도서"} 3D 표지 미리보기`}
              aria-describedby="cover-rotate-help"
              tabIndex={ready && !busy ? 0 : -1}
              className="focus-visible:ring-ring h-full w-full touch-none cursor-grab focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none active:cursor-grabbing"
              onPointerDown={(event) => {
                if (!ready || busy || !event.isPrimary || event.button !== 0)
                  return;
                drag.current = {
                  id: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  angle: design.angle,
                  tilt: design.tilt,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = drag.current;
                if (!start || start.id !== event.pointerId || busy) return;
                const { width, height } =
                  event.currentTarget.getBoundingClientRect();
                const yaw = Math.round(
                  start.angle + ((event.clientX - start.x) / width) * 360,
                );
                const angle = ((((yaw + 180) % 360) + 360) % 360) - 180;
                const tilt = Math.max(
                  -90,
                  Math.min(
                    90,
                    Math.round(
                      start.tilt + ((event.clientY - start.y) / height) * 180,
                    ),
                  ),
                );
                setDesign((current) => ({ ...current, angle, tilt }));
              }}
              onPointerUp={(event) => {
                if (drag.current?.id === event.pointerId) {
                  drag.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (
                  !ready ||
                  busy ||
                  ![
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                  ].includes(event.key)
                )
                  return;
                event.preventDefault();
                const step = event.shiftKey ? 15 : 5;
                setDesign((current) => {
                  if (event.key === "Home")
                    return { ...current, angle: 0, tilt: 0 };
                  const yaw =
                    current.angle +
                    (event.key === "ArrowRight"
                      ? step
                      : event.key === "ArrowLeft"
                        ? -step
                        : 0);
                  const tilt =
                    current.tilt +
                    (event.key === "ArrowDown"
                      ? step
                      : event.key === "ArrowUp"
                        ? -step
                        : 0);
                  return {
                    ...current,
                    angle: ((((yaw + 180) % 360) + 360) % 360) - 180,
                    tilt: Math.max(-90, Math.min(90, tilt)),
                  };
                });
              }}
            />
            {!ready && !error && (
              <p
                role="status"
                className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm"
              >
                미리보기 준비 중…
              </p>
            )}
          </div>
          <p className="text-muted-foreground text-center text-xs">
            투명 배경 · 800 × 1200 이미지
          </p>
          <p
            id="cover-rotate-help"
            className="text-muted-foreground text-center text-xs"
          >
            책을 드래그해 360° 회전 · 위아래로 기울이기
            <br />
            키보드 방향키로도 회전할 수 있습니다.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { label: "앞표지", angle: 0 },
              { label: "책등", angle: 90 },
              { label: "뒷표지", angle: 180 },
              { label: "종이 면", angle: -90 },
            ].map((view) => (
              <Button
                key={view.label}
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!ready || busy}
                onClick={() =>
                  setDesign((current) => ({
                    ...current,
                    angle: view.angle,
                    tilt: 0,
                  }))
                }
              >
                {view.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h3 className="font-medium break-keep">
              {design.title || "도서명을 입력해 주세요"}
            </h3>
            <p className="text-muted-foreground text-sm break-keep">
              {design.author || "저자명을 입력해 주세요"}
            </p>
          </div>
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">커버 템플릿</legend>
            {COVER_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                type="button"
                variant={
                  design.template === template.id ? "secondary" : "outline"
                }
                aria-pressed={design.template === template.id}
                className="h-auto min-h-11 justify-start whitespace-normal py-3 text-left"
                onClick={() => setDesign({ ...design, template: template.id })}
              >
                <span className="flex flex-col gap-1">
                  <span>{template.label}</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    {template.description}
                  </span>
                </span>
              </Button>
            ))}
          </fieldset>
          {image ? (
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <legend className="mb-2 text-sm font-medium">면별 이미지</legend>
              <p
                id="cover-face-help"
                className="text-muted-foreground text-xs"
              >
                JPG · PNG · WebP, 최대 10MB. 그림면 비율로 중앙을 채우며
                가장자리가 잘릴 수 있습니다. 책등은 두께 슬라이더에 맞춰
                잘립니다.
              </p>
              {COVER_FACES.map((face) => {
                const current = faces[face];
                const status = faceStatus[face];
                const required = face === "front";
                return (
                  <div key={face} className="flex flex-col gap-2">
                    {/* 파일 입력은 접근성 트리에서 버튼이라, 회전 버튼(앞표지·책등·뒷표지)과 이름이 겹치지 않게 한다. */}
                    <Label htmlFor={`cover-face-${face}`}>
                      {FACE_LABELS[face]} 이미지
                      {required ? " (필수)" : ""}
                    </Label>
                    <div className="flex items-start gap-3">
                      <div
                        className={`bg-muted relative h-20 shrink-0 overflow-hidden rounded-sm border ${
                          face === "spine" ? "w-5" : "w-14"
                        }`}
                      >
                        {current && (
                          <Image
                            src={current.url}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                            unoptimized={current.url.startsWith("blob:")}
                          />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Input
                          id={`cover-face-${face}`}
                          type="file"
                          accept={FACE_IMAGE_TYPES.join(",")}
                          aria-describedby={`cover-face-help cover-face-${face}-status`}
                          disabled={status === "loading"}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void loadFace(face, file);
                          }}
                        />
                        <p
                          id={`cover-face-${face}-status`}
                          role="status"
                          className={`text-xs ${
                            status && status !== "loading"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {status === "loading"
                            ? "이미지를 불러오는 중…"
                            : status
                              ? status
                              : current
                                ? "적용됨"
                                : required
                                  ? "앞표지 이미지를 올려 주세요."
                                  : "비우면 제목·저자로 그립니다."}
                        </p>
                        {current && !required && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11 self-start"
                            onClick={() =>
                              setFaces(({ [face]: removed, ...rest }) => {
                                releaseFaceImage(removed);
                                return rest;
                              })
                            }
                          >
                            {FACE_LABELS[face]} 제거
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  판·책등·머리띠 색은 앞표지 이미지 가장자리에서 정해집니다.
                </p>
                {faces.front && colors && (
                  <ul
                    aria-label="이미지에서 뽑은 색"
                    className="flex items-center gap-2"
                  >
                    {(
                      [
                        ["판", colors.base],
                        ["글자", colors.ink],
                        ["머리띠", colors.accent],
                      ] as const
                    ).map(([label, value]) => (
                      <li key={label} className="flex items-center gap-1 text-xs">
                        <span
                          aria-hidden
                          className="size-4 rounded-full border"
                          style={{ backgroundColor: value }}
                        />
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>
          ) : (
            <fieldset disabled={busy} className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-medium">표지 색상</legend>
              {COVER_PALETTES.map((palette) => (
                <Button
                  key={palette.id}
                  type="button"
                  variant={
                    design.palette === palette.id ? "secondary" : "outline"
                  }
                  aria-pressed={design.palette === palette.id}
                  className="min-h-11"
                  onClick={() => setDesign({ ...design, palette: palette.id })}
                >
                  <span
                    aria-hidden
                    className="size-4 rounded-full border"
                    style={{
                      backgroundColor: `var(--book-cover-${palette.id}-base)`,
                    }}
                  />
                  {palette.label}
                </Button>
              ))}
            </fieldset>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="cover-angle">책 각도 · {design.angle}°</Label>
            <input
              id="cover-angle"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={design.angle}
              disabled={busy}
              onChange={(event) =>
                setDesign({ ...design, angle: Number(event.target.value) })
              }
              className="accent-primary h-11 w-full"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cover-tilt">위아래 기울기 · {design.tilt}°</Label>
            <input
              id="cover-tilt"
              type="range"
              min={-90}
              max={90}
              step={1}
              value={design.tilt}
              disabled={busy}
              onChange={(event) =>
                setDesign({ ...design, tilt: Number(event.target.value) })
              }
              className="accent-primary h-11 w-full"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cover-thickness">
              책 두께 · {design.thickness}mm
            </Label>
            <input
              id="cover-thickness"
              type="range"
              min={10}
              max={50}
              step={1}
              value={design.thickness}
              disabled={busy}
              onChange={(event) =>
                setDesign({ ...design, thickness: Number(event.target.value) })
              }
              className="accent-primary h-11 w-full"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            지금 보이는 각도로 이미지가 만들어집니다. 이미지로 적용한 뒤 도서를
            저장하면 표지가 바뀝니다.
          </p>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!canApply}
              className="min-h-11"
              onClick={apply}
            >
              {busy ? "이미지 만드는 중…" : "이미지로 적용"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className="min-h-11"
              onClick={onCancel}
            >
              편집 취소
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function bitmaps(faces: Faces): CoverBitmaps {
  return {
    front: faces.front?.bitmap,
    spine: faces.spine?.bitmap,
    back: faces.back?.bitmap,
  };
}
