"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 삭제 확인 (PRD §5.10).
 *
 * 되돌릴 수 없는 삭제 앞에 한 단계를 둔다. 모달 대신 버튼 바로 위에 뜨는
 * 팝오버인 이유는, 무엇을 지우는지가 이미 그 줄에 적혀 있기 때문이다 —
 * 모달은 화면을 덮어 그 맥락을 가린다.
 *
 * 확인 버튼이 실제 submit이다. 별도 상태로 폼을 대신 제출하면 서버 액션의
 * pending 처리를 잃는다.
 */
export function ConfirmDelete({
  action,
  hidden,
  label = "삭제",
  message = "삭제할까요? 되돌릴 수 없습니다.",
  size = "sm",
}: {
  /** 서버 액션. 폼 그대로 넘어간다. */
  action: (formData: FormData) => void | Promise<void>;
  /** 액션에 실어 보낼 hidden 필드 (예: { id: post.id }). */
  hidden: Record<string, string>;
  label?: React.ReactNode;
  message?: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          className="text-destructive"
        >
          {label}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="flex w-auto flex-col gap-3 p-3"
      >
        <p className="text-sm break-keep">{message}</p>

        <form action={action} className="flex justify-end gap-2">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            취소
          </Button>
          <Button type="submit" variant="destructive" size="sm">
            삭제
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
