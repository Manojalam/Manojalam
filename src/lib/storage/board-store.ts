import {
  BOARD_CONTENT_VERSION,
  LOCAL_STORAGE_KEYS,
  isSupabaseConfigured,
} from "@/lib/config";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { generateId } from "@/lib/utils";
import type {
  BoardContent,
  BoardStorageMode,
  TemplateDefinition,
  VidyaBoard,
} from "@/lib/types";
import { getTemplateById } from "@/lib/templates";

function getStorageMode(): BoardStorageMode {
  return isSupabaseConfigured() ? "supabase" : "local";
}

function readLocalBoards(): VidyaBoard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.boards);
    return raw ? (JSON.parse(raw) as VidyaBoard[]) : [];
  } catch {
    return [];
  }
}

function writeLocalBoards(boards: VidyaBoard[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_STORAGE_KEYS.boards, JSON.stringify(boards));
}

function createEmptyContent(title = "Untitled Board"): BoardContent {
  return {
    version: BOARD_CONTENT_VERSION,
    nodes: [
      {
        id: generateId(),
        type: "mindmap",
        position: { x: 400, y: 300 },
        data: {
          text: title === "Untitled Board" ? "Central Topic" : title,
          scriptMode: "plain",
          color: DEFAULT_BOARD_SETTINGS.defaultNodeColor,
          tags: [],
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { ...DEFAULT_BOARD_SETTINGS },
  };
}

async function supabaseListBoards(): Promise<VidyaBoard[]> {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();
  if (!supabase) return readLocalBoards();

  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    content: row.content as BoardContent,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: "supabase" as const,
  }));
}

async function supabaseGetBoard(id: string): Promise<VidyaBoard | null> {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();
  if (!supabase) return readLocalBoards().find((b) => b.id === id) ?? null;

  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    description: data.description,
    content: data.content as BoardContent,
    thumbnailUrl: data.thumbnail_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    storageMode: "supabase",
  };
}

async function supabaseCreateBoard(
  title: string,
  content: BoardContent
): Promise<VidyaBoard> {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  if (!supabase) {
    const board: VidyaBoard = {
      id: generateId(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
      storageMode: "local",
    };
    const boards = readLocalBoards();
    boards.unshift(board);
    writeLocalBoards(boards);
    return board;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("boards")
    .insert({
      title,
      content,
      user_id: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    description: data.description,
    content: data.content as BoardContent,
    thumbnailUrl: data.thumbnail_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    storageMode: "supabase",
  };
}

async function supabaseUpdateBoard(
  id: string,
  partial: Partial<Pick<VidyaBoard, "title" | "description" | "content">>
): Promise<VidyaBoard | null> {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();

  if (!supabase) {
    const boards = readLocalBoards();
    const idx = boards.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    boards[idx] = {
      ...boards[idx],
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    writeLocalBoards(boards);
    return boards[idx];
  }

  const { data, error } = await supabase
    .from("boards")
    .update({
      ...(partial.title !== undefined && { title: partial.title }),
      ...(partial.description !== undefined && {
        description: partial.description,
      }),
      ...(partial.content !== undefined && { content: partial.content }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    description: data.description,
    content: data.content as BoardContent,
    thumbnailUrl: data.thumbnail_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    storageMode: "supabase",
  };
}

async function supabaseDeleteBoard(id: string): Promise<boolean> {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();

  if (!supabase) {
    const boards = readLocalBoards().filter((b) => b.id !== id);
    writeLocalBoards(boards);
    return true;
  }

  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function listBoards(): Promise<VidyaBoard[]> {
  if (getStorageMode() === "supabase") {
    try {
      return await supabaseListBoards();
    } catch {
      return readLocalBoards();
    }
  }
  return readLocalBoards();
}

export async function getBoard(id: string): Promise<VidyaBoard | null> {
  if (getStorageMode() === "supabase") {
    try {
      return await supabaseGetBoard(id);
    } catch {
      return readLocalBoards().find((b) => b.id === id) ?? null;
    }
  }
  return readLocalBoards().find((b) => b.id === id) ?? null;
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

  return supabaseCreateBoard(boardTitle, content);
}

export async function updateBoard(
  id: string,
  partial: Partial<Pick<VidyaBoard, "title" | "description" | "content">>
): Promise<VidyaBoard | null> {
  return supabaseUpdateBoard(id, partial);
}

export async function deleteBoard(id: string): Promise<boolean> {
  return supabaseDeleteBoard(id);
}

export async function duplicateBoard(id: string): Promise<VidyaBoard | null> {
  const original = await getBoard(id);
  if (!original) return null;
  return createBoard(undefined, `${original.title} (Copy)`).then(async (board) => {
    return (await updateBoard(board.id, {
      content: structuredClone(original.content),
    }))!;
  });
}

export async function exportBoard(id: string): Promise<string | null> {
  const board = await getBoard(id);
  if (!board) return null;
  return JSON.stringify(
    {
      version: BOARD_CONTENT_VERSION,
      exportedAt: new Date().toISOString(),
      board,
    },
    null,
    2
  );
}

export async function importBoard(json: string): Promise<VidyaBoard> {
  const parsed = JSON.parse(json);
  const boardData = parsed.board ?? parsed;
  const content: BoardContent = boardData.content ?? parsed.content;
  const title = boardData.title ?? parsed.title ?? "Imported Board";

  if (!content?.nodes || !Array.isArray(content.nodes)) {
    throw new Error("Invalid board format: missing nodes array");
  }

  return createBoard(undefined, title).then(async (board) => {
    return (await updateBoard(board.id, { content, title }))!;
  });
}

export async function saveSnapshot(
  boardId: string,
  name?: string
): Promise<void> {
  const board = await getBoard(boardId);
  if (!board) return;

  if (getStorageMode() === "local") {
    const key = `vidyamap.snapshot.${boardId}.${Date.now()}`;
    localStorage.setItem(
      key,
      JSON.stringify({ name: name ?? "Snapshot", content: board.content })
    );
    return;
  }

  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("board_snapshots").insert({
    board_id: boardId,
    user_id: user?.id,
    content: board.content,
    snapshot_name: name ?? `Snapshot ${new Date().toLocaleString()}`,
  });
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

export { getStorageMode };
