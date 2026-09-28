"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

export function NewNoteButton({ sermonId }: { sermonId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="quiet"
      className="self-start"
      loading={busy}
      icon={<Plus className="size-4" aria-hidden="true" />}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/sermons/${sermonId}/notes`, { body: { title: "More notes" } });
          router.refresh();
        } catch {
          toast.show("Couldn't add a note. Check your connection.", { tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      Add another note
    </Button>
  );
}
