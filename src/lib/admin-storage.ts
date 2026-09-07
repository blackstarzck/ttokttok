import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 되돌릴 대상 — 어느 버킷의 어느 경로에 올렸는가. */
export type UploadedFile = { bucket: string; path: string };

/**
 * 실패한 저장의 뒤처리.
 *
 * 도서 저장은 "파일 업로드 → 행 쓰기" 순서다. 뒤가 실패하면 **아무도
 * 가리키지 않는 파일만 버킷에 남는다.** 비공개 버킷이라 눈에 띄지도 않는다.
 *
 * 여기서 나는 오류는 던지지 않는다 — 이 함수를 부르는 시점에 이미 알려야
 * 할 실패가 있고, 뒤처리 실패로 그 메시지를 덮으면 관리자는 정작 고쳐야
 * 할 것을 못 본다. 로그로만 남긴다.
 *
 * 비공개 버킷 접근이 필요해 service role로 처리한다 (FRONTEND.md §5).
 */
export async function removeUploaded(files: UploadedFile[]): Promise<void> {
  if (files.length === 0) return;

  const admin = createAdminClient();
  for (const file of files) {
    const { error } = await admin.storage.from(file.bucket).remove([file.path]);
    if (error) {
      console.error(
        `업로드 되돌리기 실패 ${file.bucket}/${file.path}: ${error.message}`,
      );
    }
  }
}
