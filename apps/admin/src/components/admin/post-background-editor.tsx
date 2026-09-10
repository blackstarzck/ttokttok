"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import { Button } from "@ttokttok/ui/components/button";
import { BACKGROUND_IMAGE_MAX_BYTES, BACKGROUND_IMAGE_TYPES, type CardBackground } from "@ttokttok/shared/card-background";

const presets = [
  { key: "paper", label: "종이", text: "dark" },
  { key: "peach", label: "살구", text: "dark" },
  { key: "lavender", label: "연보라", text: "dark" },
  { key: "forest", label: "숲", text: "light" },
  { key: "navy", label: "밤", text: "light" },
] as const;

export function PostBackgroundEditor({ value, onChange }: {
  value: CardBackground;
  onChange: (value: CardBackground) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  useEffect(() => {
    if (colorInput.current) colorInput.current.value = value.color ?? getComputedStyle(colorInput.current).getPropertyValue("--post-paper").trim();
  }, [value.color, value.type]);
  function patch(next: Partial<CardBackground>) { onChange({ ...value, ...next }); }

  return (
    <fieldset className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">게시글 배경</legend>
      <input type="hidden" name="background" value={JSON.stringify(value)} />
      <input type="hidden" name="remove-background-image" value={value.imageUrl ? "0" : "1"} />
      <p className="text-muted-foreground text-sm">글이 있는 중앙 영역에만 적용됩니다. 상단 문구와 표시 방식은 아래에서 계속 편집할 수 있어요.</p>
      <div className="flex gap-4">
        {(["solid", "image"] as const).map(type => (
          <label key={type} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="background-type-choice" value={type}
              checked={value.type === type} onChange={() => patch({ type,
                ...(type === "image" && !value.imageUrl ? { text: "light" } : {}),
              })} />
            {type === "solid" ? "단색" : "이미지"}
          </label>
        ))}
      </div>
      {value.type === "solid" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" aria-label="추천 배경색">
            {presets.map(preset => (
              <Button key={preset.key} type="button" variant="outline"
                onClick={event => patch({
                  color: getComputedStyle(event.currentTarget).getPropertyValue(`--post-${preset.key}`).trim(),
                  text: preset.text,
                })}>
                <span aria-hidden className="size-4 rounded-full border"
                  style={{ backgroundColor: `var(--post-${preset.key})` }} />
                {preset.label}
              </Button>
            ))}
          </div>
          <Label htmlFor="background-color">직접 색상 선택</Label>
          <Input ref={colorInput} id="background-color" type="color" className="h-11 w-24 p-1"
            onChange={event => patch({ color: event.target.value })} />
        </div>
      ) : null}
      <div hidden={value.type !== "image"} className="flex flex-col gap-3">
        <Label htmlFor="background-image">배경 이미지</Label>
        <Input ref={input} id="background-image" name="background-image" type="file"
          disabled={value.type !== "image"} accept={BACKGROUND_IMAGE_TYPES.join(",")}
          required={value.type === "image" && !value.imageUrl}
          aria-describedby="background-image-help background-image-error"
          onChange={event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const message = !BACKGROUND_IMAGE_TYPES.includes(file.type)
              ? "JPG, PNG, WebP 이미지를 선택해 주세요."
              : file.size > BACKGROUND_IMAGE_MAX_BYTES ? "3MB 이하 이미지를 선택해 주세요." : "";
            event.target.setCustomValidity(message);
            setError(message);
            if (message) return;
            const url = URL.createObjectURL(file);
            setLocalUrl(url);
            patch({ imageUrl: url });
          }} />
        <p id="background-image-help" className="text-muted-foreground text-xs">JPG · PNG · WebP, 최대 3MB. 이미지가 영역을 채우며 가장자리가 잘릴 수 있습니다.</p>
        <p id="background-image-error" role="status" className="text-destructive text-sm">{error}</p>
        {value.imageUrl ? (
          <Button type="button" variant="outline" className="self-start" onClick={() => {
            if (input.current) { input.current.value = ""; input.current.setCustomValidity(""); }
            setError(""); setLocalUrl(null); patch({ imageUrl: null });
          }}>이미지 제거</Button>
        ) : <p className="text-muted-foreground text-sm">배경 이미지를 첨부해 주세요.</p>}
        {([
          ["x", "이미지 가로 위치"], ["y", "이미지 세로 위치"], ["dim", "배경 어둡기"],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={`background-${key}`}>{label} · {value[key]}%</Label>
            <input id={`background-${key}`} type="range" min="0" max="100" step="1"
              value={value[key]} onChange={event => patch({ [key]: Number(event.target.value) })}
              className="min-h-11 w-full" />
          </div>
        ))}
      </div>
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="mb-2 text-sm font-medium">글자색</legend>
        {(["dark", "light"] as const).map(text => (
          <label key={text} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="background-text-choice" checked={value.text === text}
              onChange={() => patch({ text })} />
            {text === "dark" ? "어두운 글자" : "밝은 글자"}
          </label>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-xs">미리보기에서 문장과 설명이 또렷하게 읽히는지 확인해 주세요.</p>
    </fieldset>
  );
}
