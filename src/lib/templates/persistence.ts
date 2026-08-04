import type { BoardContent } from "../types";

export async function ensureTemplateBoardContent<Board extends { content: BoardContent }>(
  templateId: string | undefined,
  intendedContent: BoardContent,
  savedBoard: Board,
  repair: () => Promise<Board>
): Promise<Board> {
  const shouldContainTemplate = !!templateId && intendedContent.nodes.length > 0;
  if (!shouldContainTemplate || savedBoard.content.nodes.length > 0) return savedBoard;

  const repairedBoard = await repair();
  if (repairedBoard.content.nodes.length === 0) {
    throw new Error("The template content could not be saved. Please try again.");
  }
  return repairedBoard;
}
