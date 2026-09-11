"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import {
  COVER_FACES,
  defaultCoverDesign,
  type CoverDesign,
  type CoverFace,
} from "@ttokttok/shared/cover-design";

const BookCoverDesigner = dynamic(
  () =>
    import("./book-cover-designer").then((module) => module.BookCoverDesigner),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="text-muted-foreground py-6 text-sm">
        3D 편집기를 여는 중…
      </p>
    ),
  },
);

type FaceFiles = Partial<Record<CoverFace, File>>;

function setFiles(input: HTMLInputElement | null, file: File | undefined) {
  if (!input) return;
  const transfer = new DataTransfer();
  if (file) transfer.items.add(file);
  input.files = transfer.files;
}

export function BookCoverField({
  coverUrl,
  savedDesign,
}: {
  coverUrl: string | null;
  savedDesign: CoverDesign | null;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const faceInputs = useRef<Partial<Record<CoverFace, HTMLInputElement | null>>>(
    {},
  );
  const root = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<CoverDesign | null>(null);
  const [applied, setApplied] = useState<CoverDesign | null>(null);
  // 직전 적용에서 올린 면 파일. blob: 주소는 편집기가 닫히며 해제되므로
  // 다시 열 때는 이 파일로 재디코드한다.
  const [appliedFaces, setAppliedFaces] = useState<FaceFiles>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    function onSubmit(event: SubmitEvent) {
      const title = String(new FormData(form!).get("title") ?? "").trim();
      const author = String(new FormData(form!).get("author") ?? "").trim();
      const message = editing
        ? "표지를 이미지로 적용하거나 편집을 취소한 뒤 저장해 주세요."
        : applied && (applied.title !== title || applied.author !== author)
          ? "제목이나 저자가 바뀌었습니다. 3D 표지를 다시 열어 이미지로 적용해 주세요."
          : "";
      if (message) {
        event.preventDefault();
        event.stopPropagation();
        setError(message);
        root.current?.scrollIntoView({ block: "center" });
      }
    }
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [editing, applied]);

  function openEditor() {
    const form = root.current!.closest("form")!;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const author = String(data.get("author") ?? "").trim();
    if (!title || !author || title.length > 120 || author.length > 80) {
      setError("먼저 제목(1~120자)과 저자(1~80자)를 입력해 주세요.");
      return;
    }
    setError("");
    setEditing({
      ...(applied ?? savedDesign ?? defaultCoverDesign(title, author)),
      title,
      author,
    });
  }

  function apply(file: File, design: CoverDesign, faceUploads: FaceFiles) {
    setFiles(fileInput.current, file);
    for (const face of COVER_FACES)
      setFiles(faceInputs.current[face] ?? null, faceUploads[face]);
    setPreview(URL.createObjectURL(file));
    setApplied(design);
    setAppliedFaces(faceUploads);
    setEditing(null);
    setError("");
  }

  function clearFaces() {
    for (const face of COVER_FACES)
      setFiles(faceInputs.current[face] ?? null, undefined);
    setAppliedFaces({});
  }

  function reset() {
    fileInput.current!.value = "";
    clearFaces();
    setApplied(null);
    setPreview(null);
    setError("");
  }

  const imageUrl = preview ?? coverUrl;
  return (
    <div ref={root} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="cover_design"
        value={applied ? JSON.stringify(applied) : ""}
      />
      {/* 이미지 템플릿의 면별 축소본. 편집기가 적용할 때 채우고 사람은 만지지 않는다. */}
      {COVER_FACES.map((face) => (
        <input
          key={face}
          ref={(element) => {
            faceInputs.current[face] = element;
          }}
          type="file"
          name={`cover_image_${face}`}
          hidden
          tabIndex={-1}
          aria-hidden
        />
      ))}
      <div className="flex flex-col gap-2">
        <Label htmlFor="cover">표지 이미지</Label>
        <Input
          ref={fileInput}
          id="cover"
          name="cover"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={!!editing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            clearFaces();
            if (file && file.size > 2 * 1024 * 1024) {
              event.target.value = "";
              setApplied(null);
              setPreview(null);
              setError("표지 이미지는 2MB 이하로 올려 주세요.");
              return;
            }
            setPreview(file ? URL.createObjectURL(file) : null);
            setApplied(null);
            setError("");
          }}
        />
        <p className="text-muted-foreground text-xs">
          PNG · JPEG · WebP, 최대 2MB. 직접 올리거나 3D 표지를 만들 수 있습니다.
        </p>
      </div>
      {editing ? (
        <BookCoverDesigner
          initialDesign={editing}
          initialFaces={appliedFaces}
          onApply={apply}
          onCancel={() => {
            setEditing(null);
            setError("");
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {imageUrl && (
            <div className="bg-muted relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-sm border">
              <Image
                src={imageUrl}
                alt="저장할 도서 표지"
                fill
                sizes="112px"
                className="object-contain"
                unoptimized={!!preview}
              />
            </div>
          )}
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={openEditor}
            >
              {applied || savedDesign ? "3D 표지 다시 편집" : "3D 표지 만들기"}
            </Button>
            <p role="status" className="text-muted-foreground text-xs">
              {preview
                ? "표지가 준비되었습니다. 아래 저장 버튼을 눌러 반영해 주세요."
                : coverUrl
                  ? "현재 저장된 표지입니다."
                  : "현재 표지 없음 — 제목과 저자로 표시됩니다."}
            </p>
            {preview && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={reset}
              >
                표지 변경 취소
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
