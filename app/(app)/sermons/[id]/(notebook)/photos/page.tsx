import type { Metadata } from "next";
import { PhotoGallery } from "@/components/sources/photo-gallery";
import { AddSources } from "@/components/upload/add-sources";
import { requirePageUser } from "@/lib/auth/session";
import { getPhotos } from "@/lib/queries/notebook";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string }> }) {
  const { id } = await params;
  const { photo } = await searchParams;
  const { supabase } = await requirePageUser(`/sermons/${id}/photos`);
  const photos = await getPhotos(supabase, id, { originals: true });
  return (
    <div className="flex flex-col gap-8">
      <PhotoGallery sermonId={id} photos={photos} initialOpen={photo ?? null} />
      <section aria-labelledby="add-photos" className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 id="add-photos" className="label-caps">
          Add more
        </h2>
        <AddSources sermonId={id} hasYouTube />
      </section>
    </div>
  );
}
