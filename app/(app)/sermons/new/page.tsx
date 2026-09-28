import type { Metadata } from "next";
import { NewSermon } from "@/components/sermon/new-sermon";

export const metadata: Metadata = { title: "New sermon" };

export default function NewSermonPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6 sm:pt-10">
      <h1 className="text-2xl font-bold">New sermon</h1>
      <p className="mt-2 text-ink-muted">Start however you like — you can add the video, photos, and notes to the same notebook anytime.</p>
      <NewSermon />
    </div>
  );
}
