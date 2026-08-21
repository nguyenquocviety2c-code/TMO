// ============================================
// FsCheckpoint — shadow git checkpoint manager
// ============================================
//
// Uses a hidden .code-team-checkpoints/ directory inside the workspace
// to store snapshots of files before edits are applied.
// Enables rollback to any checkpoint by restoring files from the snapshot.
//
// Architecture:
//   .code-team-checkpoints/
//     <checkpointId>/
//       manifest.json   — { id, sessionId, label, createdAt, files: { relPath: snapshotRelPath } }
//       files/
//         <relPath>     — exact copy of file at checkpoint time
//
// @module FsCheckpoint

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ============================================
// Types
// ============================================

export interface CheckpointManifest {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  files: Record<string, string>; // relPath → snapshotRelPath
}

export interface CheckpointInfo {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  fileCount: number;
  files: string[];
}

export interface CreateCheckpointInput {
  sessionId: string;
  label: string;
  filePaths: string[]; // relative paths within workspace
}

export interface RestoreResult {
  success: boolean;
  error?: string;
  restoredFiles: string[];
  failedFiles: string[];
}

// ============================================
// FsCheckpoint
// ============================================

export class FsCheckpoint {
  private checkpointsDir: string;

  constructor(workspaceRoot: string) {
    this.checkpointsDir = path.join(workspaceRoot, ".code-team-checkpoints");
  }

  // ---------------------------------------------------------------------------
  // Create checkpoint
  // ---------------------------------------------------------------------------

  /**
   * Create a checkpoint: snapshot specified files into .code-team-checkpoints/<id>/files/.
   * Returns the checkpoint manifest.
   */
  async createCheckpoint(input: CreateCheckpointInput): Promise<CheckpointInfo> {
    const id = `ckpt_${crypto.randomUUID()}`;
    const ckptDir = path.join(this.checkpointsDir, id);
    const filesDir = path.join(ckptDir, "files");

    fs.mkdirSync(filesDir, { recursive: true });

    const manifest: CheckpointManifest = {
      id,
      sessionId: input.sessionId,
      label: input.label,
      createdAt: Date.now(),
      files: {},
    };

    const workspaceRoot = path.resolve(this.checkpointsDir, "..");

    for (const relPath of input.filePaths) {
      const absPath = path.join(workspaceRoot, relPath);
      const snapshotRelPath = relPath.replace(/[/\\]/g, "_");
      const snapshotAbsPath = path.join(filesDir, snapshotRelPath);

      try {
        if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
          const content = fs.readFileSync(absPath);
          fs.writeFileSync(snapshotAbsPath, content);
          manifest.files[relPath] = snapshotRelPath;
        }
        // If file doesn't exist, skip (no snapshot needed)
      } catch (err) {
        // Log but continue — partial checkpoint is better than none
        console.warn(`[FsCheckpoint] Failed to snapshot ${relPath}:`, err);
      }
    }

    // Write manifest
    const manifestPath = path.join(ckptDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    return {
      id: manifest.id,
      sessionId: manifest.sessionId,
      label: manifest.label,
      createdAt: manifest.createdAt,
      fileCount: Object.keys(manifest.files).length,
      files: Object.keys(manifest.files),
    };
  }

  // ---------------------------------------------------------------------------
  // Restore checkpoint
  // ---------------------------------------------------------------------------

  /**
   * Restore files from a checkpoint back into the workspace.
   * Overwrites current files with the snapshot versions.
   */
  async restoreCheckpoint(checkpointId: string): Promise<RestoreResult> {
    const ckptDir = path.join(this.checkpointsDir, checkpointId);
    const manifestPath = path.join(ckptDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        error: `Checkpoint ${checkpointId} not found`,
        restoredFiles: [],
        failedFiles: [],
      };
    }

    let manifest: CheckpointManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {
      return {
        success: false,
        error: `Failed to read manifest for checkpoint ${checkpointId}`,
        restoredFiles: [],
        failedFiles: [],
      };
    }

    const workspaceRoot = path.resolve(this.checkpointsDir, "..");
    const filesDir = path.join(ckptDir, "files");
    const restoredFiles: string[] = [];
    const failedFiles: string[] = [];

    for (const [relPath, snapshotRelPath] of Object.entries(manifest.files)) {
      const snapshotAbsPath = path.join(filesDir, snapshotRelPath);
      const targetAbsPath = path.join(workspaceRoot, relPath);

      try {
        if (!fs.existsSync(snapshotAbsPath)) {
          failedFiles.push(relPath);
          continue;
        }

        const content = fs.readFileSync(snapshotAbsPath);
        const targetDir = path.dirname(targetAbsPath);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetAbsPath, content);
        restoredFiles.push(relPath);
      } catch (err) {
        failedFiles.push(relPath);
        console.warn(`[FsCheckpoint] Failed to restore ${relPath}:`, err);
      }
    }

    return {
      success: failedFiles.length === 0,
      error: failedFiles.length > 0 ? `${failedFiles.length} file(s) failed to restore` : undefined,
      restoredFiles,
      failedFiles,
    };
  }

  // ---------------------------------------------------------------------------
  // List checkpoints
  // ---------------------------------------------------------------------------

  /**
   * List all checkpoints, optionally filtered by sessionId.
   */
  async listCheckpoints(sessionId?: string): Promise<CheckpointInfo[]> {
    if (!fs.existsSync(this.checkpointsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.checkpointsDir, { withFileTypes: true });
    const checkpoints: CheckpointInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(this.checkpointsDir, entry.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest: CheckpointManifest = JSON.parse(
          fs.readFileSync(manifestPath, "utf-8"),
        );

        if (sessionId && manifest.sessionId !== sessionId) continue;

        checkpoints.push({
          id: manifest.id,
          sessionId: manifest.sessionId,
          label: manifest.label,
          createdAt: manifest.createdAt,
          fileCount: Object.keys(manifest.files).length,
          files: Object.keys(manifest.files),
        });
      } catch {
        // Skip corrupted manifests
      }
    }

    // Sort by createdAt descending (newest first)
    checkpoints.sort((a, b) => b.createdAt - a.createdAt);

    return checkpoints;
  }

  // ---------------------------------------------------------------------------
  // Delete checkpoint
  // ---------------------------------------------------------------------------

  /**
   * Delete a checkpoint directory and all its snapshots.
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const ckptDir = path.join(this.checkpointsDir, checkpointId);

    if (!fs.existsSync(ckptDir)) {
      return false;
    }

    try {
      fs.rmSync(ckptDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Get checkpoint detail
  // ---------------------------------------------------------------------------

  /**
   * Get full manifest for a checkpoint.
   */
  async getCheckpoint(checkpointId: string): Promise<CheckpointManifest | null> {
    const manifestPath = path.join(this.checkpointsDir, checkpointId, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {
      return null;
    }
  }
}

// ============================================
// Singleton (per workspace)
// ============================================

const instances = new Map<string, FsCheckpoint>();

export function getFsCheckpoint(workspaceRoot: string): FsCheckpoint {
  const normalized = path.resolve(workspaceRoot);
  let instance = instances.get(normalized);
  if (!instance) {
    instance = new FsCheckpoint(normalized);
    instances.set(normalized, instance);
  }
  return instance;
}