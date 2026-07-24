import { BOARD_CONTENT_VERSION } from "@/lib/config";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import type { BoardAccessRole, BoardContent, VidyaBoard } from "@/lib/types";
import { getTemplateById } from "@/lib/templates";
import { requireSupabaseClient } from "@/lib/supabase/client";
import { generateId } from "@/lib/utils";
import { normalizePersistedEdges, normalizePersistedNodes } from "@/lib/canvas/node-persistence";

export interface BoardRow {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  content: BoardContent;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeBoardContent(content: BoardContent): BoardContent {
  return {
    ...content,
    version: BOARD_CONTENT_VERSION,
    nodes: normalizePersistedNodes(content.nodes),
    edges: normalizePersistedEdges(content.edges),
    relationships: Array.isArray(content.relationships) ? content.relationships : [],
    relationshipFans: Array.isArray(content.relationshipFans) ? content.relationshipFans : [],
  };
}

export function rowToBoard(
  row: BoardRow,
  accessRole: BoardAccessRole = "owner"
): VidyaBoard {
  return {
    id: row.id,
    userId: row.user_id,
    accessRole,
    title: row.title,
    description: row.description,
    content: normalizeBoardContent(row.content),
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: "supabase",
  };
}

function createEmptyContent(title = "Untitled Board"): BoardContent {
  return {
    version: BOARD_CONTENT_VERSION,
    nodes: [
      {
        id: generateId(),
        type: "shape",
        position: { x: 400, y: 300 },
        data: {
          shapeType: "rounded",
          text: title === "Untitled Board" ? "Central Topic" : title,
          scriptMode: "plain",
          color: DEFAULT_BOARD_SETTINGS.defaultNodeColor,
          tags: [],
        },
        style: { width: 180 },
      },
    ],
    edges: [],
    relationships: [],
    relationshipFans: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { ...DEFAULT_BOARD_SETTINGS },
  };
}

async function getCurrentUserId(): Promise<string> {
  const supabase = requireSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to do that.");
  }
  return user.id;
}

async function rolesForBoards(
  rows: BoardRow[],
  currentUserId: string
): Promise<Map<string, BoardAccessRole>> {
  const roles = new Map<string, BoardAccessRole>();
  const sharedBoardIds = rows
    .filter((row) => row.user_id !== currentUserId)
    .map((row) => row.id);

  rows.forEach((row) => {
    if (row.user_id === currentUserId) roles.set(row.id, "owner");
  });
  if (!sharedBoardIds.length) return roles;

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("board_collaborators")
    .select("board_id, role")
    .eq("user_id", currentUserId)
    .in("board_id", sharedBoardIds);

  if (error) throw error;
  (data ?? []).forEach((row) => {
    if (row.role === "editor" || row.role === "viewer") {
      roles.set(row.board_id as string, row.role);
    }
  });
  return roles;
}

/** All owned and shared boards for the current user, newest first. */
export async function listBoards(): Promise<VidyaBoard[]> {
  const supabase = requireSupabaseClient();
  const currentUserId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as BoardRow[];
  const roles = await rolesForBoards(rows, currentUserId);
  return rows.map((row) => rowToBoard(row, roles.get(row.id) ?? "viewer"));
}

/** Returns null when the board doesn't exist OR the user has no access (RLS). */
export async function getBoard(id: string): Promise<VidyaBoard | null> {
  const supabase = requireSupabaseClient();
  const currentUserId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as BoardRow;
  const roles = await rolesForBoards([row], currentUserId);
  return rowToBoard(row, roles.get(row.id) ?? "viewer");
}

export async function createBoard(
  templateId?: string,
  title?: string
): Promise<VidyaBoard> {
  let content: BoardContent;
  let boardTitle = title ?? "Untitled Board";

  if (templateId) {
    const template = getTemplateById(templateId);
    if (template) {
      content = structuredClone(template.content);
      boardTitle = title ?? template.name;
    } else {
      content = createEmptyContent(boardTitle);
    }
  } else {
    content = createEmptyContent(boardTitle);
  }

  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("boards")
    .insert({ user_id: userId, title: boardTitle, content: normalizeBoardContent(content) })
    .select()
    .single();

  if (error) throw error;
  return rowToBoard(data as BoardRow, "owner");
}

export async function updateBoard(
  id: string,
  partial: Partial<Pick<VidyaBoard, "title" | "description" | "content">>
): Promise<VidyaBoard | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("boards")
    .update({
      ...(partial.title !== undefined && { title: partial.title }),
      ...(partial.description !== undefined && { description: partial.description }),
      ...(partial.content !== undefined && { content: normalizeBoardContent(partial.content) }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as BoardRow;
  const currentUserId = await getCurrentUserId();
  const role: BoardAccessRole = row.user_id === currentUserId ? "owner" : "editor";
  return rowToBoard(row, role);
}

/** Convenience wrapper used by autosave. */
export async function saveBoardContent(
  id: string,
  content: BoardContent
): Promise<VidyaBoard | null> {
  return updateBoard(id, { content });
}

export async function deleteBoard(id: string): Promise<boolean> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function duplicateBoard(id: string): Promise<VidyaBoard | null> {
  const original = await getBoard(id);
  if (!original) return null;
  const copy = await createBoard(undefined, `${original.title} (Copy)`);
  return updateBoard(copy.id, { content: structuredClone(original.content) });
}

export async function exportBoard(id: string): Promise<string | null> {
  const board = await getBoard(id);
  if (!board) return null;
  return JSON.stringify(
    { version: BOARD_CONTENT_VERSION, exportedAt: new Date().toISOString(), board },
    null,
    2
  );
}

export async function importBoard(json: string): Promise<VidyaBoard> {
  const parsed = JSON.parse(json);
  const boardData = parsed.board ?? parsed;
  const rawContent: BoardContent = boardData.content ?? parsed.content;
  const title = boardData.title ?? parsed.title ?? "Imported Board";

  if (!rawContent?.nodes || !Array.isArray(rawContent.nodes)) {
    throw new Error("Invalid board format: missing nodes array");
  }

  const content = normalizeBoardContent(rawContent);

  const board = await createBoard(undefined, title);
  return (await updateBoard(board.id, { content, title }))!;
}

export async function saveSnapshot(boardId: string, name?: string): Promise<void> {
  const board = await getBoard(boardId);
  if (!board) return;

  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  await supabase.from("board_snapshots").insert({
    board_id: boardId,
    user_id: userId,
    content: board.content,
    snapshot_name: name ?? `Snapshot ${new Date().toLocaleString()}`,
  });
}
