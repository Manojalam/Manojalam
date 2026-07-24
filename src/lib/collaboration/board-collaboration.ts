import type { BoardAccessRole } from "@/lib/types";
import { requireSupabaseClient } from "@/lib/supabase/client";

export type BoardMember = {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: BoardAccessRole;
  createdAt: string;
};

type BoardMemberRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: BoardAccessRole;
  created_at: string;
};

function rowToMember(row: BoardMemberRow): BoardMember {
  const email = row.email?.trim() ?? "";
  return {
    userId: row.user_id,
    email,
    displayName: row.display_name?.trim() || email.split("@")[0] || "Member",
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function listBoardMembers(boardId: string): Promise<BoardMember[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc("list_board_members", {
    target_board_id: boardId,
  });
  if (error) throw error;
  return ((data ?? []) as BoardMemberRow[]).map(rowToMember);
}

export async function inviteBoardMember(
  boardId: string,
  email: string,
  role: Exclude<BoardAccessRole, "owner">
): Promise<BoardMember> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc("share_board_with_email", {
    target_board_id: boardId,
    invitee_email: email.trim(),
    collaborator_role: role,
  });
  if (error) throw error;
  const member = ((data ?? []) as BoardMemberRow[])[0];
  if (!member) throw new Error("The collaborator could not be added.");
  return rowToMember(member);
}

export async function updateBoardMemberRole(
  boardId: string,
  userId: string,
  role: Exclude<BoardAccessRole, "owner">
): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("set_board_collaborator_role", {
    target_board_id: boardId,
    target_user_id: userId,
    collaborator_role: role,
  });
  if (error) throw error;
}

export async function removeBoardMember(
  boardId: string,
  userId: string
): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("remove_board_collaborator", {
    target_board_id: boardId,
    target_user_id: userId,
  });
  if (error) throw error;
}
