"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  copyDiagramToBoard,
  listBoards,
} from "@/lib/storage/board-store";
import type { CrossBoardDiagramPayload } from "@/lib/canvas/cross-board-copy";
import type { VidyaBoard } from "@/lib/types";

interface CopyToBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBoardId: string;
  payload: CrossBoardDiagramPayload | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The diagram could not be copied. Please try again.";
}

export function CopyToBoardDialog({
  open,
  onOpenChange,
  currentBoardId,
  payload,
}: CopyToBoardDialogProps) {
  const [boards, setBoards] = useState<VidyaBoard[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState("");
  const destinations = useMemo(
    () => boards.filter(
      (board) => board.id !== currentBoardId && board.accessRole !== "viewer"
    ),
    [boards, currentBoardId]
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    listBoards()
      .then((nextBoards) => {
        if (!active) return;
        setBoards(nextBoards);
        setLoadError("");
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const copy = async () => {
    if (!payload || !destinationId || copying) return;
    const destination = destinations.find((board) => board.id === destinationId);
    setCopying(true);
    try {
      const updated = await copyDiagramToBoard(destinationId, payload);
      onOpenChange(false);
      toast.success(`Copied to ${destination?.title ?? updated.title}.`, {
        description: "The copy was placed beside the board's existing content.",
        action: {
          label: "Open board",
          onClick: () => {
            window.open(
              `/app/boards/${updated.id}`,
              "_blank",
              "noopener,noreferrer"
            );
          },
        },
      });
    } catch (error) {
      toast.error("Could not copy diagram", {
        description: errorMessage(error),
      });
    } finally {
      setCopying(false);
    }
  };

  const changeOpen = (nextOpen: boolean) => {
    if (copying) return;
    if (!nextOpen) setDestinationId("");
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy to another board</DialogTitle>
          <DialogDescription>
            Choose an editable board. The diagram, its connectors, and any
            required source objects will be copied.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading boards…
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : destinations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            You do not have another editable board yet.
            <Button
              variant="link"
              className="mt-2 h-auto p-0"
              onClick={() => window.open("/app/boards/new", "_blank", "noopener,noreferrer")}
            >
              Create a board
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Select
            value={destinationId}
            onValueChange={setDestinationId}
            disabled={copying}
          >
            <SelectTrigger aria-label="Destination board">
              <SelectValue placeholder="Select a destination board" />
            </SelectTrigger>
            <SelectContent>
              {destinations.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.title}
                  {board.accessRole === "editor" ? " · Shared" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={copying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={copy}
            disabled={
              loading
              || Boolean(loadError)
              || !destinationId
              || !payload
              || copying
            }
          >
            {copying && <Loader2 className="h-4 w-4 animate-spin" />}
            {copying ? "Copying…" : "Copy diagram"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
