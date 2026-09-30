import { requireSupabaseClient } from "../supabase/client";
import { getStorageUserId } from "./board-store";
import { listLocalBoards } from "./local-boards";
import type { TemplateSource } from "../templates/board-library";

/** Restrict cloud discovery to the signed-in owner's designs, including archived boards. */
export async function listTemplateSources(): Promise<TemplateSource[]> {
  const userId = await getStorageUserId();
  const local = await listLocalBoards();
  const sources: TemplateSource[] = local.map(board => ({ id: board.id, title: board.title, updatedAt: board.updatedAt, settings: board.content.settings }));
  if (!userId) return sources;
  const client = requireSupabaseClient();
  // Page through settings only rather than downloading every board's nodes and answers.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("boards")
      .select("id,title,updated_at,settings:content->settings")
      .eq("user_id", userId).order("id").range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) sources.push({ id: row.id, title: row.title, updatedAt: row.updated_at, settings: (row.settings ?? {}) as TemplateSource["settings"] });
    if (!data || data.length < 500) break;
  }
  return sources;
}
