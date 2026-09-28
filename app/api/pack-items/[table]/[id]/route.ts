import { z } from "zod";
import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { correctPackItem, packItemCorrectionSchema, PACK_ITEM_TABLES, type PackItemTable } from "@/lib/pack/corrections";

const tableParam = z.enum(Object.keys(PACK_ITEM_TABLES) as [PackItemTable, ...PackItemTable[]]);

export const PATCH = route<{ params: Promise<{ table: string; id: string }> }>("pack.correct", async (req, { params }) => {
  const p = await params;
  const table = tableParam.parse(p.table);
  const id = uuidParam.parse(p.id);
  const ctx = await serviceContext();
  await correctPackItem(ctx, table, id, await readJson(req, packItemCorrectionSchema));
  return json({ ok: true });
});
