"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, RefreshCw, Plus, CheckCircle2, XCircle } from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  rootPath: string;
  isActive: boolean;
  createdAt: string;
}

export function WorkspaceSelector() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newRootPath, setNewRootPath] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/code-team/workspace");
      const json = await res.json();
      if (json.ok) {
        setWorkspaces(json.data.workspaces || []);
        setActiveWorkspace(json.data.activeWorkspace || null);
      } else {
        setError(json.error || "Failed to load workspaces");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleCreate = async () => {
    if (!newName.trim() || !newRootPath.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/code-team/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), rootPath: newRootPath.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setNewName("");
        setNewRootPath("");
        await fetchWorkspaces();
      } else {
        setCreateError(json.error || "Failed to create workspace");
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch("/api/code-team/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      const json = await res.json();
      if (json.ok) {
        await fetchWorkspaces();
      }
    } catch {
      // silent fail
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Workspace
          <Button variant="ghost" size="icon" onClick={fetchWorkspaces} title="Refresh">
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

        {/* Active workspace */}
        {activeWorkspace && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{activeWorkspace.name}</p>
              <p className="text-xs text-muted-foreground truncate">{activeWorkspace.rootPath}</p>
            </div>
            <Badge variant="default">Active</Badge>
          </div>
        )}

        {/* Workspace list */}
        {workspaces.length > 0 && (
          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors ${
                    ws.isActive ? "bg-accent" : ""
                  }`}
                  onClick={() => handleSetActive(ws.id)}
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{ws.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ws.rootPath}</p>
                  </div>
                  {ws.isActive && <Badge variant="secondary">Active</Badge>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {workspaces.length === 0 && !activeWorkspace && (
          <p className="text-sm text-muted-foreground">No workspaces yet. Create one below.</p>
        )}

        {/* Create new */}
        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs">Create New Workspace</Label>
          <Input
            placeholder="Name (e.g. my-project)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
          />
          <Input
            placeholder="Root path (e.g. /home/user/projects/my-app)"
            value={newRootPath}
            onChange={(e) => setNewRootPath(e.target.value)}
            disabled={creating}
          />
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !newRootPath.trim()}
            className="w-full"
          >
            {creating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1">Create</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}