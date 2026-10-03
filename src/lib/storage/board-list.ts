import type { VidyaBoard } from "../types";
import type { BoardOrganization } from "./board-organization";

export type BoardSort = "updated" | "created" | "title-asc" | "title-desc";
export function filterBoards(boards: VidyaBoard[], organization: BoardOrganization, folder: string, query: string, sort: BoardSort): VidyaBoard[] {
  const search = query.trim().toLocaleLowerCase();
  return boards.filter((board) => {
    const assigned = organization.assignments[board.id];
    const validFolder = organization.folders.some((item) => item.id === assigned) ? assigned : undefined;
    return (folder === "all" || (folder === "unfiled" ? !validFolder : validFolder === folder))
      && `${board.title}\n${board.description ?? ""}`.toLocaleLowerCase().includes(search);
  }).sort((a, b) => {
    if (sort === "title-asc") return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (sort === "title-desc") return b.title.localeCompare(a.title) || a.id.localeCompare(b.id);
    return (sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id);
  });
}
