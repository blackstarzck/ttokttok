import type { Metadata } from "next";
import { BookForm } from "@/components/admin/book-form";

export const metadata: Metadata = { title: "새 도서" };

export default function NewBookPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">새 도서</h1>
      <BookForm />
    </div>
  );
}
