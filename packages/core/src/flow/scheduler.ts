/**
 * Scheduler - manages concurrent node execution
 */

import type { FlowGraph } from './flow-graph';

/**
 * Scheduler for managing node execution readiness
 */
export class Scheduler {
  private completed: Set<string> = new Set();
  private running: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private graph: FlowGraph;
  private maxConcurrency: number;

  constructor(graph: FlowGraph, maxConcurrency: number = 10) {
    this.graph = graph;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Get nodes that are ready to execute
   * A node is ready when all its upstream nodes have completed
   */
  getReadyNodes(): string[] {
    const ready: string[] = [];

    for (const node of this.graph.getAllNodes()) {
      if (this.completed.has(node.id) || this.running.has(node.id) || this.failed.has(node.id)) {
        continue;
      }

      const upstream = this.graph.getUpstream(node.id);
      const allUpstreamDone = upstream.every(
        (id) => this.completed.has(id)
      );

      // If any upstream failed, skip this node (branch isolation)
      const anyUpstreamFailed = upstream.some(
        (id) => this.failed.has(id)
      );

      if (anyUpstreamFailed) {
        this.failed.add(node.id);
        continue;
      }

      if (allUpstreamDone) {
        ready.push(node.id);
      }
    }

    // Respect concurrency limit
    const availableSlots = this.maxConcurrency - this.running.size;
    return ready.slice(0, Math.max(0, availableSlots));
  }

  /**
   * Mark a node as running
   */
  markRunning(nodeId: string): void {
    this.running.add(nodeId);
  }

  /**
   * Mark a node as completed
   */
  markCompleted(nodeId: string): void {
    this.running.delete(nodeId);
    this.completed.add(nodeId);
  }

  /**
   * Mark a node as failed
   */
  markFailed(nodeId: string): void {
    this.running.delete(nodeId);
    this.failed.add(nodeId);
  }

  /**
   * Check if all nodes are done (completed or failed)
   */
  isFinished(): boolean {
    const total = this.graph.getAllNodes().length;
    return this.completed.size + this.failed.size >= total;
  }

  /**
   * Check if any nodes are still running
   */
  hasRunning(): boolean {
    return this.running.size > 0;
  }

  /**
   * Get completed node IDs
   */
  getCompleted(): Set<string> {
    return new Set(this.completed);
  }

  /**
   * Get failed node IDs
   */
  getFailed(): Set<string> {
    return new Set(this.failed);
  }
}
