// ============================================
// DiffManager — unified diff compute, apply, revert
// ============================================

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================
// Types
// ============================================

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[]; // lines with +/-/space prefix
}

export interface DiffResult {
  hunks: DiffHunk[];
  unified: string; // full unified diff string
}

export interface ApplyResult {
  success: boolean;
  error?: string;
  appliedHunks: number;
  rejectedHunks: number;
}

// ============================================
// DiffManager
// ============================================

export class DiffManager {
  /**
   * Compute unified diff between oldContent and newContent.
   * Returns structured hunks + unified string.
   */
  computeDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
  ): DiffResult {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    const hunks = this._computeHunks(oldLines, newLines);
    const unified = this._formatUnified(hunks, filePath);

    return { hunks, unified };
  }

  /**
   * Apply a diff (unified format) to a file on disk.
   * Uses simple line-by-line patch algorithm.
   * Returns ApplyResult with success/failure + counts.
   */
  applyDiff(
    filePath: string,
    diffContent: string,
    workspaceRoot: string,
  ): ApplyResult {
    const absPath = path.join(workspaceRoot, filePath);

    // Read current file content
    let currentLines: string[];
    try {
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        currentLines = fs.readFileSync(absPath, "utf-8").split("\n");
      } else {
        currentLines = [];
      }
    } catch {
      return { success: false, error: `Cannot read file: ${absPath}`, appliedHunks: 0, rejectedHunks: 0 };
    }

    // Parse hunks from diff
    const hunks = this._parseHunks(diffContent);

    // Apply each hunk
    let appliedHunks = 0;
    let rejectedHunks = 0;
    const result = [...currentLines];

    // Apply hunks in reverse order to preserve line numbers
    const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

    for (const hunk of sortedHunks) {
      const applyResult = this._applyHunk(result, hunk);
      if (applyResult) {
        appliedHunks++;
      } else {
        rejectedHunks++;
      }
    }

    if (rejectedHunks > 0) {
      return {
        success: false,
        error: `${rejectedHunks} hunk(s) failed to apply`,
        appliedHunks,
        rejectedHunks,
      };
    }

    // Write result back to disk
    try {
      const dir = path.dirname(absPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(absPath, result.join("\n"), "utf-8");
    } catch (err) {
      return {
        success: false,
        error: `Failed to write file: ${err instanceof Error ? err.message : "Unknown error"}`,
        appliedHunks,
        rejectedHunks,
      };
    }

    return { success: true, appliedHunks, rejectedHunks };
  }

  /**
   * Revert a diff — apply the inverse (swap old↔new).
   * Computes reverse diff from the same old/new pair and applies it.
   */
  revertDiff(
    filePath: string,
    oldContent: string,
    newContent: string,
    workspaceRoot: string,
  ): ApplyResult {
    // Reverse: compute diff from new→old
    const reverse = this.computeDiff(newContent, oldContent, filePath);
    return this.applyDiff(filePath, reverse.unified, workspaceRoot);
  }

  // ---------------------------------------------------------------------------
  // Private: Hunk computation (Myers-like simplified)
  // ---------------------------------------------------------------------------

  private _computeHunks(
    oldLines: string[],
    newLines: string[],
    contextLines = 3,
  ): DiffHunk[] {
    const edits = this._computeEdits(oldLines, newLines);
    if (edits.length === 0) return [];

    // Group edits into hunks with context
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      const prevEdit = i > 0 ? edits[i - 1] : null;

      // Determine if this edit should merge with previous hunk
      const gap = prevEdit
        ? edit.oldStart - (prevEdit.oldStart + prevEdit.oldCount)
        : Infinity;

      if (currentHunk && gap <= contextLines * 2) {
        // Merge: extend current hunk
        const oldEnd = currentHunk.oldStart + currentHunk.oldCount;
        const newEnd = currentHunk.newStart + currentHunk.newCount;

        // Add context lines between edits
        for (let j = oldEnd; j < edit.oldStart; j++) {
          currentHunk.lines.push(` ${oldLines[j]}`);
          currentHunk.oldCount++;
          currentHunk.newCount++;
        }

        // Add edit lines
        for (let j = edit.oldStart; j < edit.oldStart + edit.oldCount; j++) {
          currentHunk.lines.push(`-${oldLines[j]}`);
        }
        for (let j = edit.newStart; j < edit.newStart + edit.newCount; j++) {
          currentHunk.lines.push(`+${newLines[j]}`);
        }
        currentHunk.oldCount += edit.oldCount;
        currentHunk.newCount += edit.newCount;
      } else {
        // New hunk
        if (currentHunk) hunks.push(currentHunk);

        currentHunk = {
          oldStart: Math.max(0, edit.oldStart - contextLines),
          oldCount: contextLines,
          newStart: Math.max(0, edit.newStart - contextLines),
          newCount: contextLines,
          lines: [],
        };

        // Pre-context
        for (
          let j = Math.max(0, edit.oldStart - contextLines);
          j < edit.oldStart;
          j++
        ) {
          currentHunk.lines.push(` ${oldLines[j]}`);
        }

        // Edit lines
        for (let j = edit.oldStart; j < edit.oldStart + edit.oldCount; j++) {
          currentHunk.lines.push(`-${oldLines[j]}`);
        }
        for (let j = edit.newStart; j < edit.newStart + edit.newCount; j++) {
          currentHunk.lines.push(`+${newLines[j]}`);
        }
        currentHunk.oldCount += edit.oldCount;
        currentHunk.newCount += edit.newCount;

        // Post-context
        const postStart = edit.oldStart + edit.oldCount;
        const postEnd = Math.min(oldLines.length, postStart + contextLines);
        for (let j = postStart; j < postEnd; j++) {
          currentHunk.lines.push(` ${oldLines[j]}`);
          currentHunk.oldCount++;
          currentHunk.newCount++;
        }
      }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
  }

  private _computeEdits(
    oldLines: string[],
    newLines: string[],
  ): Array<{ oldStart: number; oldCount: number; newStart: number; newCount: number }> {
    // Simple LCS-based edit computation
    const lcs = this._lcsMatrix(oldLines, newLines);
    const edits: Array<{
      oldStart: number;
      oldCount: number;
      newStart: number;
      newCount: number;
    }> = [];

    let o = oldLines.length;
    let n = newLines.length;

    while (o > 0 || n > 0) {
      if (o > 0 && n > 0 && oldLines[o - 1] === newLines[n - 1]) {
        o--;
        n--;
      } else if (n > 0 && (o === 0 || lcs[o][n - 1] >= lcs[o - 1][n])) {
        // Insert
        const newStart = n - 1;
        let count = 1;
        n--;
        while (
          n > 0 &&
          (o === 0 || lcs[o][n - 1] >= lcs[o - 1][n]) &&
          !(o > 0 && oldLines[o - 1] === newLines[n - 1])
        ) {
          count++;
          n--;
        }
        edits.unshift({ oldStart: o, oldCount: 0, newStart, newCount: count });
      } else if (o > 0 && (n === 0 || lcs[o][n - 1] < lcs[o - 1][n])) {
        // Delete
        const oldStart = o - 1;
        let count = 1;
        o--;
        while (
          o > 0 &&
          (n === 0 || lcs[o][n - 1] < lcs[o - 1][n]) &&
          !(n > 0 && oldLines[o - 1] === newLines[n - 1])
        ) {
          count++;
          o--;
        }
        edits.unshift({ oldStart, oldCount: count, newStart: n, newCount: 0 });
      }
    }

    return edits;
  }

  private _lcsMatrix(a: string[], b: string[]): number[][] {
    const m = a.length + 1;
    const n = b.length + 1;
    const dp: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));

    for (let i = 1; i < m; i++) {
      for (let j = 1; j < n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp;
  }

  // ---------------------------------------------------------------------------
  // Private: Unified format
  // ---------------------------------------------------------------------------

  private _formatUnified(hunks: DiffHunk[], filePath: string): string {
    const lines: string[] = [];
    lines.push(`--- a/${filePath}`);
    lines.push(`+++ b/${filePath}`);

    for (const hunk of hunks) {
      lines.push(
        `@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`,
      );
      for (const line of hunk.lines) {
        lines.push(line);
      }
    }

    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Private: Parse hunks from unified diff string
  // ---------------------------------------------------------------------------

  private _parseHunks(diffContent: string): DiffHunk[] {
    const lines = diffContent.split("\n");
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    const hunkHeaderRe = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/;

    for (const line of lines) {
      const match = line.match(hunkHeaderRe);
      if (match) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = {
          oldStart: parseInt(match[1]) - 1,
          oldCount: parseInt(match[2]),
          newStart: parseInt(match[3]) - 1,
          newCount: parseInt(match[4]),
          lines: [],
        };
        continue;
      }

      if (currentHunk) {
        if (line.startsWith(" ") || line.startsWith("-") || line.startsWith("+")) {
          currentHunk.lines.push(line);
        }
        // Skip header lines (---, +++) and empty
      }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
  }

  // ---------------------------------------------------------------------------
  // Private: Apply single hunk to lines array (mutates in place)
  // ---------------------------------------------------------------------------

  private _applyHunk(lines: string[], hunk: DiffHunk): boolean {
    // Verify context matches
    const oldStart = hunk.oldStart;
    let lineIdx = oldStart;

    for (const hunkLine of hunk.lines) {
      if (hunkLine.startsWith(" ")) {
        // Context line — must match
        if (lineIdx >= lines.length || lines[lineIdx] !== hunkLine.slice(1)) {
          return false; // Context mismatch
        }
        lineIdx++;
      } else if (hunkLine.startsWith("-")) {
        // Remove line — must match
        if (lineIdx >= lines.length || lines[lineIdx] !== hunkLine.slice(1)) {
          return false; // Line to remove doesn't match
        }
        lines.splice(lineIdx, 1);
        // Don't increment lineIdx — next line shifts up
      } else if (hunkLine.startsWith("+")) {
        // Add line
        lines.splice(lineIdx, 0, hunkLine.slice(1));
        lineIdx++;
      }
    }

    return true;
  }
}

/** Singleton instance */
let _instance: DiffManager | null = null;

export function getDiffManager(): DiffManager {
  if (!_instance) {
    _instance = new DiffManager();
  }
  return _instance;
}