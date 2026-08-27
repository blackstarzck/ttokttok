"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CARD_REGISTRY } from "@/components/cards/registry";

export type ComposerCard = {
  template_category: string;
  body: Record<string, string>;
};

const TEMPLATES = Object.entries(CARD_REGISTRY).map(([key, entry]) => ({
  key,
  label: entry.label,
}));

/**
 * 카드 조합 편집기 (PRD §5.10 — "카드 유형과 순서를 조합").
 *
 * 슬롯 정의는 레지스트리에서 온다. 새 템플릿을 등록하면 여기 손대지
 * 않아도 선택지와 입력칸이 자동으로 생긴다.
 *
 * 값은 폼 필드로만 제출한다 — `card-{i}-{슬롯키}` 이름 규약을 서버
 * 액션이 그대로 읽는다.
 */
export function CardComposer({ initial }: { initial: ComposerCard[] }) {
  const [cards, setCards] = useState<ComposerCard[]>(
    initial.length ? initial : [{ template_category: "a", body: {} }],
  );

  function addCard() {
    setCards((cs) => [...cs, { template_category: "a", body: {} }]);
  }

  function removeCard(i: number) {
    setCards((cs) => cs.filter((_, idx) => idx !== i));
  }

  function move(i: number, delta: number) {
    setCards((cs) => {
      const next = [...cs];
      const target = i + delta;
      if (target < 0 || target >= next.length) return cs;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  function setTemplate(i: number, template: string) {
    setCards((cs) =>
      cs.map((c, idx) =>
        idx === i ? { template_category: template, body: c.body } : c,
      ),
    );
  }

  function setSlot(i: number, key: string, value: string) {
    setCards((cs) =>
      cs.map((c, idx) =>
        idx === i ? { ...c, body: { ...c.body, [key]: value } } : c,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="cardCount" value={cards.length} />

      {cards.map((card, i) => {
        const entry = CARD_REGISTRY[card.template_category];

        return (
          <fieldset
            key={i}
            className="border-border flex flex-col gap-4 rounded-lg border p-4"
          >
            <legend className="text-muted-foreground px-1 text-xs">
              {i + 1}번째 카드
            </legend>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-40 flex-1 flex-col gap-2">
                <Label htmlFor={`card-${i}-template`}>템플릿</Label>
                <select
                  id={`card-${i}-template`}
                  name={`card-${i}-template`}
                  value={card.template_category}
                  onChange={(e) => setTemplate(i, e.target.value)}
                  className="border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} ({t.key})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-lg"
                  className="min-h-11 min-w-11"
                  aria-label="위로"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-lg"
                  className="min-h-11 min-w-11"
                  aria-label="아래로"
                  disabled={i === cards.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="text-destructive min-h-11 min-w-11"
                  aria-label="카드 삭제"
                  disabled={cards.length === 1}
                  onClick={() => removeCard(i)}
                >
                  <X aria-hidden />
                </Button>
              </div>
            </div>

            {entry?.slots.map((slot) => {
              const name = `card-${i}-${slot.key}`;
              const value = card.body[slot.key] ?? "";
              return (
                <div key={slot.key} className="flex flex-col gap-2">
                  <Label htmlFor={name}>
                    {slot.label}
                    {slot.required ? " *" : ""}
                  </Label>
                  {slot.type === "textarea" ? (
                    <Textarea
                      id={name}
                      name={name}
                      rows={3}
                      value={value}
                      required={slot.required}
                      onChange={(e) => setSlot(i, slot.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={name}
                      name={name}
                      value={value}
                      required={slot.required}
                      onChange={(e) => setSlot(i, slot.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            <p className="text-muted-foreground text-xs">
              나머지 정보(표지·제목·저자·목차 등)는 선택한 도서에서 자동으로
              들어갑니다.
            </p>
          </fieldset>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        className="min-h-11 self-start"
        onClick={addCard}
      >
        <Plus aria-hidden />
        카드 추가
      </Button>
    </div>
  );
}
