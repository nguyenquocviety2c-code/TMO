import { NextResponse } from "next/server";
import { getWorkspaceManager } from "@/lib/workspace/workspace-manager";
import { getDiffManager } from "@/lib/workspace/diff-manager";

export const dynamic = "force-dynamic";

/**
 * GET /api/code-team/edits
 * List pending edits. Optional query: ?sessionId=xxx
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || undefined;

    const wm = getWorkspaceManager();
    const edits = await wm.listPendingEdits(sessionId);

    return NextResponse.json({ ok: true, data: edits });
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
 * POST /api/code-team/edits
 * Create a pending edit from agent proposal.
 * Body: { sessionId, filePath, newContent, agentName }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, filePath, newContent, agentName } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { ok: false, error: "sessionId is required" },
        { status: 400 },
      );
    }
    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { ok: false, error: "filePath is required" },
        { status: 400 },
      );
    }
    if (newContent === undefined || newContent === null || typeof newContent !== "string") {
      return NextResponse.json(
        { ok: false, error: "newContent is required and must be a string" },
        { status: 400 },
      );
    }
    if (!agentName || typeof agentName !== "string") {
      return NextResponse.json(
        { ok: false, error: "agentName is required" },
        { status: 400 },
      );
    }

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();

    // Validate filePath is within workspace
    try {
      await wm.resolveInWorkspace(filePath);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Invalid file path",
        },
        { status: 400 },
      );
    }

    const edit = await wm.createPendingEdit({
      sessionId,
      filePath,
      newContent,
      agentName,
      workspaceRootPath: activeWs.rootPath,
    });

    return NextResponse.json({ ok: true, data: edit }, { status: 201 });
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
 * PATCH /api/code-team/edits
 * Approve or reject a pending edit.
 * Body: { editId, action: "approve" | "reject" }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { editId, action } = body;

    if (!editId || typeof editId !== "string") {
      return NextResponse.json(
        { ok: false, error: "editId is required" },
        { status: 400 },
      );
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { ok: false, error: 'action must be "approve" or "reject"' },
        { status: 400 },
      );
    }

    const wm = getWorkspaceManager();
    const activeWs = await wm.getActiveWorkspace();

    if (action === "approve") {
      const edit = await wm.approvePendingEdit(editId, activeWs.rootPath);
      return NextResponse.json({ ok: true, data: edit });
    } else {
      const edit = await wm.rejectPendingEdit(editId);
      return NextResponse.json({ ok: true, data: edit });
    }
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