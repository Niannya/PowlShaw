export const COMMENTS_PER_PAGE = 30;
export const COMMENT_EDIT_MINUTES = 30;

export type { Comment, CommentsPage } from "@/lib/api/types";

export function canEditComment(createdAt: string) {
  const timestamp = Date.parse(`${createdAt.replace(" ", "T")}Z`);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= COMMENT_EDIT_MINUTES * 60 * 1000;
}
