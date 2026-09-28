"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";

export function RebuildButton({ sermonId, label = "Rebuild now" }: { sermonId: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      loading={busy}
      icon={<RotateCw className="size-4" aria-hidden="true" />}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/sermons/${sermonId}/rebuild`, { method: "POST" });
          toast.show("Rebuilding your Sermon Pack. Your edits are kept.");
          router.refresh();
        } catch (err) {
          toast.show(err instanceof ApiClientError ? err.message : "Couldn't start the rebuild.", { tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
