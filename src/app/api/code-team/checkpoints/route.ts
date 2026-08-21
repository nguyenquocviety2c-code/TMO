import { NextResponse } from "next/server";
import { getWorkspaceManager } from "@/lib/workspace/workspace-manager";
import { getFsCheckpoint } from "@/lib/workspace/fs-checkpoint";

export const dynamic = "force-dynamic";

/**
 * GET /api/code-team/checkpoints
 * List all checkpoints. Optional query: ?sessionId=xxx
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || undefined;

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();
    const fsc = getFsCheckpoint(activeWs.rootPath);

    const checkpoints = await fsc.listCheckpoints(sessionId);

    return NextResponse.json({ ok: true, data: checkpoints });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/code-team/checkpoints
 * Create a new checkpoint (snapshot specified files).
 * Body: { sessionId, label, filePaths: string[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, label, filePaths } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { ok: false, error: "sessionId is required" },
        { status: 400 },
      );
    }
    if (!label || typeof label !== "string") {
      return NextResponse.json(
        { ok: false, error: "label is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json(
        { ok: false, error: "filePaths must be a non-empty array" },
        { status: 400 },
      );
    }

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();

    // Validate all filePaths are within workspace
    for (const fp of filePaths) {
      try {
        await wm.resolveInWorkspace(fp);
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error: `Invalid file path: ${fp}`,
          },
          { status: 400 },
        );
      }
    }

    const fsc = getFsCheckpoint(activeWs.rootPath);
    const checkpoint = await fsc.createCheckpoint({
      sessionId,
      label,
      filePaths,
    });

    return NextResponse.json({ ok: true, data: checkpoint }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/code-team/checkpoints
 * Restore a checkpoint (rollback).
 * Body: { checkpointId }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { checkpointId } = body;

    if (!checkpointId || typeof checkpointId !== "string") {
      return NextResponse.json(
        { ok: false, error: "checkpointId is required" },
        { status: 400 },
      );
    }

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();
    const fsc = getFsCheckpoint(activeWs.rootPath);

    const result = await fsc.restoreCheckpoint(checkpointId);

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Restore failed",
          data: result,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/code-team/checkpoints?checkpointId=xxx
 * Delete a checkpoint.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const checkpointId = url.searchParams.get("checkpointId");

    if (!checkpointId) {
      return NextResponse.json(
        { ok: false, error: "checkpointId is required" },
        { status: 400 },
      );
    }

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();
    const fsc = getFsCheckpoint(activeWs.rootPath);

    const deleted = await fsc.deleteCheckpoint(checkpointId);

    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: `Checkpoint ${checkpointId} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: { deleted: true, checkpointId } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}