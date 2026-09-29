import { BOARD_CONTENT_VERSION } from "@/lib/config";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import type { BoardAccessRole, BoardContent, VidyaBoard } from "@/lib/types";
import { instantiateTemplate } from "@/lib/templates";
import { ensureTemplateBoardContent } from "@/lib/templates/persistence";
import { createClient, requireSupabaseClient } from "@/lib/supabase/client";
import { addLocalBoard, getLocalBoard, listLocalBoards, updateLocalBoard, deleteLocalBoard, isLocalBoardId } from "./local-boards";
import { generateId } from "@/lib/utils";
import { normalizePersistedEdges, normalizePersistedNodes } from "@/lib/canvas/node-persistence";
import {
  normalizeCanvasLayerMembership,
  normalizeCanvasLayers,
} from "@/lib/canvas/layers";
import {
  insertCrossBoardDiagram,
  type CrossBoardDiagramPayload,
} from "@/lib/canvas/cross-board-copy";

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
  const layers = normalizeCanvasLayers(content.layers);
  const membership = normalizeCanvasLayerMembership(
    normalizePersistedNodes(content.nodes),
    normalizePersistedEdges(content.edges),
    layers
  );
  return {
    ...content,
    version: BOARD_CONTENT_VERSION,
    nodes: membership.nodes as BoardContent["nodes"],
    edges: membership.edges as BoardContent["edges"],
    relationships: Array.isArray(content.relationships) ? content.relationships : [],
    relationshipFans: Array.isArray(content.relationshipFans) ? content.relationshipFans : [],
    layers,
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
    layers: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { ...DEFAULT_BOARD_SETTINGS },
  };
}

/** Verification errors must not silently switch cloud accounts to device storage. */
export async function getStorageUserId(): Promise<string | null> {
  const client = createClient();
  if (!client) return null;
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session) return null;
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Please sign in again to access your cloud boards.");
  return user.id;
}

async function createLocalBoard(title: string, content: BoardContent): Promise<VidyaBoard> {
  const now = new Date().toISOString();
  return addLocalBoard({
    id: `guest-${generateId()}`, userId: null, accessRole: "owner", title,
    description: null, thumbnailUrl: null, content: normalizeBoardContent(content),
    createdAt: now, updatedAt: now, storageMode: "local",
  });
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
  const currentUserId = await getStorageUserId();
  const local = await listLocalBoards();
  if (!currentUserId) return local.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as BoardRow[];
  const roles = await rolesForBoards(rows, currentUserId);
  return [...local, ...rows.map((row) => rowToBoard(row, roles.get(row.id) ?? "viewer"))]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Returns null when the board doesn't exist OR the user has no access (RLS). */
export async function getBoard(id: string): Promise<VidyaBoard | null> {
  if (isLocalBoardId(id)) {
    const board = await getLocalBoard(id);
    return board ? { ...board, content: normalizeBoardContent(board.content) } : null;
  }
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
    const template = instantiateTemplate(templateId);
    if (template) {
      content = template.content;
      boardTitle = title ?? template.title;
    } else {
      content = createEmptyContent(boardTitle);
    }
  } else {
    content = createEmptyContent(boardTitle);
  }

  const userId = await getStorageUserId();
  if (!userId) return createLocalBoard(boardTitle, content);
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("boards")
    .insert({ user_id: userId, title: boardTitle, content: normalizeBoardContent(content) })
    .select()
    .single();

  if (error) throw error;
  const board = rowToBoard(data as BoardRow, "owner");

  // A template must never navigate to a silently empty board. If an insert
  // response ever loses its JSON payload, repair it once and verify the row.
  return ensureTemplateBoardContent(templateId, content, board, async () => {
    const { data: repairedData, error: repairError } = await supabase
      .from("boards")
      .update({ content: normalizeBoardContent(content) })
      .eq("id", board.id)
      .select()
      .single();
    if (repairError) throw repairError;
    return rowToBoard(repairedData as BoardRow, "owner");
  });
}

/** Create a board with complete content in one insert (used by reviewed imports). */
export async function createBoardFromContent(
  title: string,
  content: BoardContent
): Promise<VidyaBoard> {
  const boardTitle = title.trim() || "Imported Board";
  const userId = await getStorageUserId();
  if (!userId) return createLocalBoard(boardTitle, content);
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("boards")
    .insert({
      user_id: userId,
      title: boardTitle,
      content: normalizeBoardContent(content),
    })
    .select()
    .single();

  if (error) throw error;
  return rowToBoard(data as BoardRow, "owner");
}

export async function updateBoard(
  id: string,
  partial: Partial<Pick<VidyaBoard, "title" | "description" | "content">>
): Promise<VidyaBoard | null> {
  if (isLocalBoardId(id)) return updateLocalBoard(id, {
    ...partial,
    ...(partial.content && { content: normalizeBoardContent(partial.content) }),
  });
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

/** Insert a portable diagram selection into an editable destination board. */
export async function copyDiagramToBoard(
  destinationBoardId: string,
  payload: CrossBoardDiagramPayload
): Promise<VidyaBoard> {
  const destination = await getBoard(destinationBoardId);
  if (!destination) {
    throw new Error("The destination board could not be found.");
  }
  if (destination.accessRole === "viewer") {
    throw new Error("You only have view access to the destination board.");
  }
  const updated = await updateBoard(destinationBoardId, {
    content: insertCrossBoardDiagram(destination.content, payload),
  });
  if (!updated) {
    throw new Error("The diagram could not be copied to the destination board.");
  }
  return updated;
}

export async function deleteBoard(id: string): Promise<boolean> {
  if (isLocalBoardId(id)) return deleteLocalBoard(id);
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function duplicateBoard(id: string): Promise<VidyaBoard | null> {
  const original = await getBoard(id);
  if (!original) return null;
  if (original.storageMode === "local") return createLocalBoard(`${original.title} (Copy)`, structuredClone(original.content));
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

  return createBoardFromContent(title, content);
}

export async function saveSnapshot(boardId: string, name?: string): Promise<void> {
  const board = await getBoard(boardId);
  if (!board) return;
  if (board.storageMode === "local") {
    throw new Error("Download a JSON backup for this device board. Cloud snapshots require an account.");
  }

  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  await supabase.from("board_snapshots").insert({
    board_id: boardId,
    user_id: userId,
    content: board.content,
    snapshot_name: name ?? `Snapshot ${new Date().toLocaleString()}`,
  });
}

/** Stable upload IDs make retries safe without overwriting existing cloud boards. */
export async function moveGuestBoardToAccount(id: string): Promise<VidyaBoard> {
  if (!isLocalBoardId(id)) throw new Error("This board is already in the cloud.");
  const userId = await getCurrentUserId();
  const local = await getLocalBoard(id);
  if (!local) throw new Error("This device board was already moved or deleted. Refresh your boards.");
  const supabase = requireSupabaseClient();
  const cloudId = id.slice("guest-".length);
  const { error } = await supabase.from("boards").upsert({
    id: cloudId, user_id: userId, title: local.title, description: local.description,
    content: local.content, created_at: local.createdAt,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const cloud = await getBoard(cloudId);
  if (!cloud || cloud.userId !== userId || !sameBoardData(local, cloud)) {
    throw new Error("The cloud copy differs from this device board. Your device copy is safe; duplicate it to upload a separate copy.");
  }
  if (!(await deleteLocalBoard(id, local))) {
    throw new Error("The cloud copy was saved, but this device board changed during upload. Its newer edits are still on this device.");
  }
  return cloud;
}

function sameBoardData(a: VidyaBoard, b: VidyaBoard): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
    }
    return JSON.stringify(value);
  };
  return a.title === b.title && a.description === b.description
    && canonical(normalizeBoardContent(a.content)) === canonical(normalizeBoardContent(b.content));
}
