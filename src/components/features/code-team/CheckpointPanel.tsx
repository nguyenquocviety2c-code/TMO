"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  RefreshCw,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface CheckpointInfo {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  fileCount: number;
  files: string[];
}

export function CheckpointPanel() {
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedCkpt, setExpandedCkpt] = useState<string | null>(null);

  const fetchCheckpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/code-team/checkpoints");
      const json = await res.json();
      if (json.ok) {
        setCheckpoints(json.data || []);
      } else {
        setError(json.error || "Failed to load checkpoints");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCheckpoints();
  }, [fetchCheckpoints]);

  const handleRestore = async (checkpointId: string) => {
    setRestoring(checkpointId);
    try {
      const res = await fetch("/api/code-team/checkpoints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId }),
      });
      const json = await res.json();
      if (json.ok) {
        await fetchCheckpoints();
      }
    } catch {
      // silent fail
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (checkpointId: string) => {
    setDeleting(checkpointId);
    try {
      const res = await fetch(`/api/code-team/checkpoints?checkpointId=${checkpointId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        await fetchCheckpoints();
      }
    } catch {
      // silent fail
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedCkpt(expandedCkpt === id ? null : id);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Checkpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Checkpoints
          {checkpoints.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {checkpoints.length}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={fetchCheckpoints} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {checkpoints.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No checkpoints yet. Checkpoints are created automatically before edits are applied.
          </p>
        )}

        {checkpoints.length > 0 && (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {checkpoints.map((ckpt) => (
                <div
                  key={ckpt.id}
                  className="border rounded-md p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <History className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ckpt.label}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(ckpt.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ckpt.fileCount} file{ckpt.fileCount !== 1 ? "s" : ""} ·{" "}
                        Session: {ckpt.sessionId.slice(0, 8)}...
                      </p>
                    </div>
                  </div>

                  {/* File list toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(ckpt.id)}
                    className="text-xs h-6"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {expandedCkpt === ckpt.id ? "Hide files" : `Show ${ckpt.fileCount} files`}
                  </Button>
                  {expandedCkpt === ckpt.id && (
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-2 border-l-2">
                      {ckpt.files.map((f) => (
                        <p key={f} className="truncate">
                          {f}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(ckpt.id)}
                      disabled={restoring === ckpt.id || deleting === ckpt.id}
                      className="flex-1"
                    >
                      {restoring === ckpt.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      <span className="ml-1">Restore</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(ckpt.id)}
                      disabled={deleting === ckpt.id || restoring === ckpt.id}
                      className="text-destructive hover:text-destructive"
                    >
                      {deleting === ckpt.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}