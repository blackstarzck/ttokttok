"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ttokttok/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ttokttok/ui/components/dialog";
import { useOverlayPresence } from "@ttokttok/ui/overlay-presence";

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (options: {
      objectType: "text";
      text: string;
      link: { webUrl: string; mobileWebUrl: string };
      buttonTitle: string;
    }) => Promise<unknown> | void
  };
};

declare global {
  interface Window { Kakao?: KakaoSdk }
}

const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;

/** Mounted only while open, so SDK loading and video suspension follow the dialog. */
export function ShareDialog({ url, title, onClose, onShared }: {
  url: string;
  title: string;
  onClose: () => void;
  onShared: () => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [opener] = useState(() => document.activeElement);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const { register } = useOverlayPresence();
  useEffect(() => register(), [register]);
  useEffect(() => {
    if (!kakaoKey || ready || sdkFailed) return;
    const timeout = window.setTimeout(() => setSdkFailed(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [ready, sdkFailed]);

  function initialize() {
    try {
      if (!window.Kakao || !kakaoKey) throw new Error("Kakao unavailable");
      if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoKey);
      setSdkFailed(false);
      setReady(true);
    } catch { setSdkFailed(true); }
  }

  async function copyLink() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        input.current?.focus();
        input.current?.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed");
      }
      setCopied(true);
      toast.success("링크를 복사했어요");
      await onShared();
    } catch {
      toast.error("링크를 복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function shareKakao() {
    if (!ready || !window.Kakao || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      // Keep the SDK call in the click event so mobile browsers allow its popup.
      await window.Kakao.Share.sendDefault({
        objectType: "text", text: title.slice(0, 200),
        link: { webUrl: url, mobileWebUrl: url }, buttonTitle: "똑똑에서 보기",
      });
      // SDK completion means handoff, not confirmed delivery to a recipient.
      await onShared();
    } catch {
      toast.error("카카오톡 공유를 열지 못했어요. 링크 복사를 이용해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      {kakaoKey ? <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js" onReady={initialize} onError={() => setSdkFailed(true)} /> : null}
      <DialogContent showCloseButton={false} className="gap-6 bg-card p-6 text-card-foreground sm:max-w-md" onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      }}>
        <div className="flex items-center justify-between gap-4">
          <DialogTitle>공유</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="공유창 닫기"><X aria-hidden /></Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">카카오톡으로 공유하거나 게시물 링크를 복사하세요.</DialogDescription>
        <div className="flex flex-col items-start gap-3">
          <button type="button" onClick={shareKakao} disabled={!ready || pending} className="flex min-w-20 flex-col items-center gap-2 rounded-lg p-2 text-sm outline-none hover:bg-accent active:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed" aria-label="카카오톡으로 공유" aria-describedby={!kakaoKey || sdkFailed ? "kakao-share-status" : undefined}>
            {/* External brand colors, matching the existing Kakao login exception. */}
            <span className="flex size-16 items-center justify-center rounded-full bg-[#FEE500] text-[#191600]">
              <svg viewBox="0 0 24 24" className="size-9" fill="currentColor" aria-hidden="true"><path d="M12 3C6.48 3 2 6.46 2 10.73c0 2.76 1.88 5.18 4.7 6.55l-.96 3.51c-.08.3.25.54.51.37l4.16-2.75c.52.06 1.05.09 1.59.09 5.52 0 10-3.47 10-7.77S17.52 3 12 3Z" /></svg>
            </span>
            카카오톡
          </button></div>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2">
          <input ref={input} aria-label="공유 링크" readOnly value={url} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button type="button" variant="secondary" onClick={copyLink} disabled={pending} className="min-h-11 shrink-0 rounded-full px-4">
            {copied ? <Check className="size-4" aria-hidden /> : null}{copied ? "복사됨" : "복사"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
