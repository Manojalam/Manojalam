"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Crown,
  Eye,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inviteBoardMember,
  listBoardMembers,
  removeBoardMember,
  updateBoardMemberRole,
  type BoardMember,
} from "@/lib/collaboration/board-collaboration";
import type { BoardAccessRole, VidyaBoard } from "@/lib/types";

type CollaboratorRole = Exclude<BoardAccessRole, "owner">;

type BoardShareDialogProps = {
  board: VidyaBoard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function errorMessage(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "message" in error
    && typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "M")[0] ?? "M";
  const last = parts.length > 1
    ? Array.from(parts[parts.length - 1])[0] ?? ""
    : "";
  return `${first}${last}`.toUpperCase();
}

function roleLabel(role: BoardAccessRole): string {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Can edit";
  return "View only";
}

export function BoardShareDialog({
  board,
  open,
  onOpenChange,
}: BoardShareDialogProps) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("editor");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwner = board.accessRole === "owner";

  useEffect(() => {
    if (!open) return;
    let active = true;
    listBoardMembers(board.id)
      .then((nextMembers) => {
        if (active) setMembers(nextMembers);
      })
      .catch((error) => {
        if (active) toast.error(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [board.id, open]);

  const orderedMembers = useMemo(
    () => [...members].sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return a.displayName.localeCompare(b.displayName);
    }),
    [members]
  );

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const member = await inviteBoardMember(board.id, email, inviteRole);
      setMembers((current) => [
        ...current.filter((candidate) => candidate.userId !== member.userId),
        member,
      ]);
      setEmail("");
      toast.success(`${member.displayName} can now access this board.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (
    member: BoardMember,
    role: CollaboratorRole
  ) => {
    if (member.role === role) return;
    setUpdatingUserId(member.userId);
    try {
      await updateBoardMemberRole(board.id, member.userId, role);
      setMembers((current) => current.map((candidate) =>
        candidate.userId === member.userId ? { ...candidate, role } : candidate
      ));
      toast.success(`Access updated for ${member.displayName}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRemove = async (member: BoardMember) => {
    setUpdatingUserId(member.userId);
    try {
      await removeBoardMember(board.id, member.userId);
      setMembers((current) => current.filter(
        (candidate) => candidate.userId !== member.userId
      ));
      toast.success(`${member.displayName} no longer has access.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Board link copied.");
    } catch {
      toast.error("Could not copy the board link.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Share “{board.title}”
          </DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Invite people who already have a Manojalam account."
              : `You have ${roleLabel(board.accessRole).toLowerCase()} access to this shared board.`}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form onSubmit={handleInvite} className="rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                aria-label="Collaborator email"
                autoComplete="email"
                required
                className="flex-1 bg-background"
              />
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as CollaboratorRole)}
              >
                <SelectTrigger className="w-full bg-background sm:w-32" aria-label="Invite permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Can edit</SelectItem>
                  <SelectItem value="viewer">View only</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={!email.trim() || inviting}>
                {inviting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <UserPlus className="mr-2 h-4 w-4" />}
                Invite
              </Button>
            </div>
          </form>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">People with access</p>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {members.length} {members.length === 1 ? "person" : "people"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {orderedMembers.map((member) => {
                const pending = updatingUserId === member.userId;
                return (
                  <div
                    key={member.userId}
                    className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {memberInitials(member.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <span className="truncate">{member.displayName}</span>
                        {member.role === "owner" && (
                          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Owner" />
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email || roleLabel(member.role)}
                      </p>
                    </div>

                    {isOwner && member.role !== "owner" ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Select
                          value={member.role}
                          disabled={pending}
                          onValueChange={(value) => void handleRoleChange(
                            member,
                            value as CollaboratorRole
                          )}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Permission for ${member.displayName}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">
                              <span className="flex items-center gap-2"><Pencil className="h-3.5 w-3.5" /> Can edit</span>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> View only</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${member.displayName}`}
                          disabled={pending}
                          onClick={() => void handleRemove(member)}
                        >
                          {pending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {roleLabel(member.role)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Access is required even when someone has the link.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
            {copied
              ? <Check className="mr-2 h-4 w-4 text-emerald-500" />
              : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
