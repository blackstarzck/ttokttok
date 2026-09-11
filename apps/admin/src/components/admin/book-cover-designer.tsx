"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@ttokttok/ui/components/button";
import { Label } from "@ttokttok/ui/components/label";
import {
  COVER_PALETTES,
  COVER_TEMPLATES,
  coverDesignSchema,
  type CoverDesign,
} from "@ttokttok/shared/cover-design";
import { createBookCoverRenderer } from "@/lib/book-cover-renderer";

export function BookCoverDesigner({
  initialDesign,
  onApply,
  onCancel,
}: {
  initialDesign: CoverDesign;
  onApply: (file: File, design: CoverDesign) => void;
  onCancel: () => void;
}) {
  const [design, setDesign] = useState(initialDesign);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      try {
        renderer.current?.render(design);
      } catch {
        setError("미리보기를 그리지 못했습니다. 편집을 닫고 다시 열어 주세요.");
        setReady(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [design, ready]);

  async function apply() {
    const result = coverDesignSchema.safeParse(design);
    if (!result.success) {
      setError(
        "제목은 1~120자, 저자는 1~80자로 입력해 주세요. 편집을 닫고 서지 정보를 수정할 수 있습니다.",
      );
      return;
    }
    if (!renderer.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await renderer.current.exportImage(result.data);
      onApply(
        new File([blob], "book-cover.png", { type: "image/png" }),
        result.data,
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
              disabled={!ready || busy}
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
