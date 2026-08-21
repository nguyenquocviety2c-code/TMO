/**
 * Circular Dependency Resolver
 *
 * Phát hiện và resolve circular dependencies trong decomposition plan.
 * Sử dụng Tarjan's SCC (Strongly Connected Components) để phát hiện cycles.
 * Strategy: Merge các sub-tasks trong cùng 1 cycle thành 1 sub-task lớn.
 */

import type { DependencyGraph, SubTask } from './types'

// ==================== TYPES ====================

/** Kết quả resolve */
export interface ResolveResult {
  resolved: DependencyGraph
  warnings: string[]
  mergedSubTasks: Array<{ originalIds: string[]; mergedId: string }>
}

// ==================== MAIN FUNCTION ====================

/**
 * Phát hiện và resolve circular dependencies trong dependency graph.
 *
 * @param graph - Dependency graph (có thể chứa cycles)
 * @returns Resolved graph + warnings + merged sub-tasks log
 */
export function resolveCircularDependencies(graph: DependencyGraph): ResolveResult {
  const warnings: string[] = []
  const mergedSubTasks: Array<{ originalIds: string[]; mergedId: string }> = []

  // Step 1: Detect cycles using Tarjan's SCC
  const cycles = detectCycles(graph)

  if (cycles.length === 0) {
    return { resolved: graph, warnings, mergedSubTasks }
  }

  // Step 2: Resolve each cycle
  let currentGraph = graph
  for (const cycle of cycles) {
    if (cycle.length <= 1) continue // Self-loop, skip

    // Check if cycle is too large (max 3 sub-tasks to merge)
    if (cycle.length > 3) {
      warnings.push(
        `⚠️ Cycle quá lớn (${cycle.length} sub-tasks): ${cycle.join(' → ')}. ` +
        `Chỉ merge tối đa 3 sub-tasks. Cần manual review.`
      )
      // Break the cycle by removing the weakest edge
      currentGraph = breakCycleByRemovingEdge(currentGraph, cycle)
      continue
    }

    // Merge sub-tasks in cycle
    const result = mergeCycleNodes(currentGraph, cycle)
    currentGraph = result.graph
    mergedSubTasks.push(result.mergeLog)
    warnings.push(
      `🔗 Merged cycle: ${cycle.join(' → ')} → ${result.mergeLog.mergedId}`
    )
  }

  // Step 3: Re-run topological sort
  const sorted = topologicalSort(currentGraph)
  currentGraph.topologicalOrder = sorted.order
  currentGraph.parallelGroups = sorted.parallelGroups

  return { resolved: currentGraph, warnings, mergedSubTasks }
}

// ==================== CYCLE DETECTION (Tarjan's SCC) ====================

/**
 * Phát hiện tất cả cycles trong graph sử dụng Tarjan's SCC algorithm.
 *
 * @param graph - Dependency graph
 * @returns Danh sách các cycles (mỗi cycle là mảng node IDs)
 */
function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const onStack = new Set<string>()
  const stack: string[] = []

  function dfs(nodeId: string): void {
    visited.add(nodeId)
    onStack.add(nodeId)
    stack.push(nodeId)

    // Find all neighbors (nodes that this node depends on)
    const neighbors = graph.edges
      .filter(e => e.from === nodeId)
      .map(e => e.to)

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
      } else if (onStack.has(neighbor)) {
        // Found a cycle!
        const cycleStart = stack.indexOf(neighbor)
        const cycle = stack.slice(cycleStart)
        cycles.push(cycle)
      }
    }

    stack.pop()
    onStack.delete(nodeId)
  }

  // Run DFS from each unvisited node
  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId)
    }
  }

  // Remove duplicate cycles (same set of nodes)
  const uniqueCycles: string[][] = []
  const seen = new Set<string>()
  for (const cycle of cycles) {
    const key = [...cycle].sort().join(',')
    if (!seen.has(key)) {
      seen.add(key)
      uniqueCycles.push(cycle)
    }
  }

  return uniqueCycles
}

// ==================== CYCLE RESOLUTION ====================

/**
 * Merge các sub-tasks trong cycle thành 1 sub-task lớn.
 *
 * @param graph - Current dependency graph
 * @param cycle - Array of node IDs in the cycle
 * @returns Updated graph + merge log
 */
function mergeCycleNodes(
  graph: DependencyGraph,
  cycle: string[]
): { graph: DependencyGraph; mergeLog: { originalIds: string[]; mergedId: string } } {
  const newGraph = cloneGraph(graph)

  // Create merged sub-task
  const mergedId = `merged_${cycle.join('_')}`
  const mergedSubTask: SubTask = {
    id: mergedId,
    name: `Merged: ${cycle.map(id => newGraph.nodes.get(id)?.name || id).join(' + ')}`,
    type: inferMergedType(newGraph, cycle),
    description: `Merged sub-tasks: ${cycle.join(', ')}`,
    goal: 'Complete all merged sub-tasks',
    expectedOutput: 'All outputs from merged sub-tasks',
    verificationCriteria: 'All individual verifications pass',
    dependencies: [], // Will be updated
    estimatedComplexity: inferMergedComplexity(newGraph, cycle),
    estimatedTokens: cycle.reduce((sum, id) => sum + (newGraph.nodes.get(id)?.estimatedTokens || 0), 0),
    filesToRead: [...new Set(cycle.flatMap(id => newGraph.nodes.get(id)?.filesToRead || []))],
    filesToWrite: [...new Set(cycle.flatMap(id => newGraph.nodes.get(id)?.filesToWrite || []))],
    risks: [...new Set(cycle.flatMap(id => newGraph.nodes.get(id)?.risks || []))],
  }

  // Collect external dependencies (from outside the cycle)
  const externalDeps = new Set<string>()
  for (const nodeId of cycle) {
    const node = newGraph.nodes.get(nodeId)
    if (node) {
      for (const dep of node.dependencies) {
        if (!cycle.includes(dep)) {
          externalDeps.add(dep)
        }
      }
    }
  }
  mergedSubTask.dependencies = Array.from(externalDeps)

  // Collect external dependents (nodes outside cycle that depend on nodes in cycle)
  const externalDependents: string[] = []
  for (const edge of newGraph.edges) {
    if (cycle.includes(edge.to) && !cycle.includes(edge.from)) {
      externalDependents.push(edge.from)
    }
  }

  // Remove old nodes and edges
  for (const nodeId of cycle) {
    newGraph.nodes.delete(nodeId)
  }
  newGraph.edges = newGraph.edges.filter(e => !cycle.includes(e.from) && !cycle.includes(e.to))

  // Add merged node
  newGraph.nodes.set(mergedId, mergedSubTask)

  // Add edges for external dependencies
  for (const dep of externalDeps) {
    newGraph.edges.push({ from: mergedId, to: dep })
  }

  // Add edges for external dependents
  for (const dependent of externalDependents) {
    newGraph.edges.push({ from: dependent, to: mergedId })
  }

  return {
    graph: newGraph,
    mergeLog: { originalIds: cycle, mergedId },
  }
}

/**
 * Break cycle by removing the weakest edge.
 * Used when cycle is too large to merge.
 *
 * @param graph - Current dependency graph
 * @param cycle - Array of node IDs in the cycle
 * @returns Updated graph with one edge removed
 */
function breakCycleByRemovingEdge(graph: DependencyGraph, cycle: string[]): DependencyGraph {
  const newGraph = cloneGraph(graph)

  // Find the edge to remove (weakest = least critical)
  // Strategy: Remove edge between nodes with least shared dependencies
  let edgeToRemove: { from: string; to: string } | null = null
  let minSharedDeps = Infinity

  for (let i = 0; i < cycle.length; i++) {
    const from = cycle[i]
    const to = cycle[(i + 1) % cycle.length]
    const fromNode = newGraph.nodes.get(from)
    const toNode = newGraph.nodes.get(to)

    if (fromNode && toNode) {
      const sharedDeps = fromNode.dependencies.filter(d => toNode.dependencies.includes(d)).length
      if (sharedDeps < minSharedDeps) {
        minSharedDeps = sharedDeps
        edgeToRemove = { from, to }
      }
    }
  }

  if (edgeToRemove) {
    newGraph.edges = newGraph.edges.filter(
      e => !(e.from === edgeToRemove!.from && e.to === edgeToRemove!.to)
    )
  }

  return newGraph
}

// ==================== HELPERS ====================

/**
 * Clone dependency graph.
 */
function cloneGraph(graph: DependencyGraph): DependencyGraph {
  return {
    nodes: new Map(graph.nodes),
    edges: [...graph.edges],
    topologicalOrder: [...graph.topologicalOrder],
    parallelGroups: graph.parallelGroups.map(g => [...g]),
  }
}

/**
 * Infer merged sub-task type from constituent types.
 */
function inferMergedType(graph: DependencyGraph, cycle: string[]): SubTask['type'] {
  const types = new Set(cycle.map(id => graph.nodes.get(id)?.type))
  if (types.has('database')) return 'database'
  if (types.has('backend')) return 'backend'
  if (types.has('frontend')) return 'frontend'
  if (types.has('integration')) return 'integration'
  return 'config'
}

/**
 * Infer merged complexity from constituent complexities.
 */
function inferMergedComplexity(graph: DependencyGraph, cycle: string[]): SubTask['estimatedComplexity'] {
  const complexities = cycle.map(id => graph.nodes.get(id)?.estimatedComplexity)
  if (complexities.includes('complex')) return 'complex'
  if (complexities.includes('medium')) return 'medium'
  return 'simple'
}

/**
 * Re-run topological sort after graph modification.
 */
function topologicalSort(graph: DependencyGraph): { order: string[]; parallelGroups: string[][] } {
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()

  // Initialize
  for (const [id] of graph.nodes) {
    inDegree.set(id, 0)
    adjList.set(id, [])
  }

  // Build adjacency list and in-degree
  for (const edge of graph.edges) {
    if (adjList.has(edge.from) && adjList.has(edge.to)) {
      adjList.get(edge.from)!.push(edge.to)
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1)
    }
  }

  // Kahn's algorithm
  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const order: string[] = []
  const parallelGroups: string[][] = []

  while (queue.length > 0) {
    // All nodes in queue at this level can run in parallel
    const currentLevel = [...queue]
    parallelGroups.push(currentLevel)

    const nextQueue: string[] = []

    for (const nodeId of currentLevel) {
      order.push(nodeId)
      const neighbors = adjList.get(nodeId) || []
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) {
          nextQueue.push(neighbor)
        }
      }
    }

    queue.length = 0
    queue.push(...nextQueue)
  }

  return { order, parallelGroups }
}