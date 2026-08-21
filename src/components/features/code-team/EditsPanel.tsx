"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileEdit,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PendingEdit {
  id: string;
  sessionId: string;
  filePath: string;
  agentName: string;
  status: "pending" | "approved" | "rejected";
  diff?: string;
  createdAt: string;
}

export function EditsPanel() {
  const [edits, setEdits] = useState<PendingEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchEdits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/code-team/edits");
      const json = await res.json();
      if (json.ok) {
        setEdits(json.data || []);
      } else {
        setError(json.error || "Failed to load edits");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEdits();
  }, [fetchEdits]);

  const handleAction = async (editId: string, action: "approve" | "reject") => {
    setActionLoading(editId);
    try {
      const res = await fetch("/api/code-team/edits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, action }),
      });
      const json = await res.json();
      if (json.ok) {
        await fetchEdits();
      }
    } catch {
      // silent fail
    } finally {
      setActionLoading(null);
    }
  };

  const pendingEdits = edits.filter((e) => e.status === "pending");
  const resolvedEdits = edits.filter((e) => e.status !== "pending");

  const toggleExpand = (id: string) => {
    setExpandedEdit(expandedEdit === id ? null : id);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            Pending Edits
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
          <FileEdit className="h-5 w-5" />
          Pending Edits
          {pendingEdits.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {pendingEdits.length}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={fetchEdits} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-destructive flex items-center gap-1">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {edits.length === 0 && (
          <p className="text-sm text-muted-foreground">No edits yet.</p>
        )}

        {/* Pending edits */}
        {pendingEdits.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Awaiting Review ({pendingEdits.length})
            </p>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {pendingEdits.map((edit) => (
                  <div
                    key={edit.id}
                    className="border rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{edit.filePath}</p>
                        <p className="text-xs text-muted-foreground">
                          by {edit.agentName} ·{" "}
                          {new Date(edit.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    </div>

                    {/* Diff toggle */}
                    {edit.diff && (
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(edit.id)}
                          className="text-xs h-6"
                        >
                          {expandedEdit === edit.id ? (
                            <ChevronUp className="h-3 w-3 mr-1" />
                          ) : (
                            <ChevronDown className="h-3 w-3 mr-1" />
                          )}
                          Diff
                        </Button>
                        {expandedEdit === edit.id && (
                          <pre className="text-xs bg-muted p-2 rounded-md mt-1 overflow-x-auto max-h-32">
                            {edit.diff}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleAction(edit.id, "approve")}
                        disabled={actionLoading === edit.id}
                        className="flex-1"
                      >
                        {actionLoading === edit.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        <span className="ml-1">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleAction(edit.id, "reject")}
                        disabled={actionLoading === edit.id}
                        className="flex-1"
                      >
                        <XCircle className="h-3 w-3" />
                        <span className="ml-1">Reject</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Resolved edits (collapsed) */}
        {resolvedEdits.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Resolved ({resolvedEdits.length})
            </p>
            <div className="space-y-1">
              {resolvedEdits.slice(0, 5).map((edit) => (
                <div
                  key={edit.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {edit.status === "approved" ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                  <span className="truncate">{edit.filePath}</span>
                  <span>· {edit.agentName}</span>
                </div>
              ))}
              {resolvedEdits.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{resolvedEdits.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}