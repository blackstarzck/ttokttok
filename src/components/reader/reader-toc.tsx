"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";

export type TocItem = { label: string; href: string };

/** 목차 바텀시트. 항목을 고르면 그 위치로 이동하고 시트를 닫는다. */
export function ReaderToc({
  items,
  onSelect,
  children,
}: {
  items: TocItem[];
  onSelect: (href: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>목차</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="max-h-[55vh] px-2 pb-4">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              목차 정보가 없어요.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item, i) => (
                <li key={`${i}-${item.href}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.href);
                      setOpen(false);
                    }}
                    className="hover:bg-accent focus-visible:ring-ring flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm break-keep focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
