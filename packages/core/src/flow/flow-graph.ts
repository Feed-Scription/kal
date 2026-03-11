/**
 * FlowGraph - DAG construction, topological sort, cycle detection
 */

import type { FlowDefinition, Edge, NodeDefinition } from '../types/types';
import { ValidationError } from '../types/errors';

/**
 * Adjacency info for a node in the graph
 */
export interface GraphNode {
  id: string;
  definition: NodeDefinition;
  inEdges: Edge[];
  outEdges: Edge[];
  inDegree: number;
}

/**
 * FlowGraph - represents a flow as a DAG
 */
export class FlowGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Edge[];

  constructor(flow: FlowDefinition) {
    this.edges = flow.data.edges;
    this.buildGraph(flow);
    this.detectCycles();
  }

  /**
   * Build the graph from a flow definition
   */
  private buildGraph(flow: FlowDefinition): void {
    // Register all nodes
    for (const nodeDef of flow.data.nodes) {
      this.nodes.set(nodeDef.id, {
        id: nodeDef.id,
        definition: nodeDef,
        inEdges: [],
        outEdges: [],
        inDegree: 0,
      });
    }

    // Register edges
    for (const edge of flow.data.edges) {
      const source = this.nodes.get(edge.source);
      const target = this.nodes.get(edge.target);

      if (!source) {
        throw new ValidationError(`Edge references unknown source node: "${edge.source}"`);
      }
      if (!target) {
        throw new ValidationError(`Edge references unknown target node: "${edge.target}"`);
      }

      source.outEdges.push(edge);
      target.inEdges.push(edge);
      target.inDegree++;
    }
  }

  /**
   * Detect cycles using DFS
   */
  private detectCycles(): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      inStack.add(nodeId);

      const node = this.nodes.get(nodeId)!;
      for (const edge of node.outEdges) {
        if (inStack.has(edge.target)) {
          throw new ValidationError(
            `Cycle detected in flow: ${nodeId} -> ${edge.target}`
          );
        }
        if (!visited.has(edge.target)) {
          dfs(edge.target);
        }
      }

      inStack.delete(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
  }

  /**
   * Kahn's algorithm for topological sort
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.inDegree);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);

      const node = this.nodes.get(nodeId)!;
      for (const edge of node.outEdges) {
        const newDegree = inDegree.get(edge.target)! - 1;
        inDegree.set(edge.target, newDegree);
        if (newDegree === 0) {
          queue.push(edge.target);
        }
      }
    }

    return sorted;
  }

  /**
   * Get nodes that have no incoming edges (entry points)
   */
  getEntryNodes(): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.inDegree === 0);
  }

  /**
   * Get nodes that have no outgoing edges (exit points)
   */
  getExitNodes(): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.outEdges.length === 0);
  }

  /**
   * Get a graph node by ID
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all graph nodes
   */
  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Get all edges
   */
  getEdges(): Edge[] {
    return this.edges;
  }

  /**
   * Get downstream node IDs for a given node
   */
  getDownstream(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.outEdges.map((e) => e.target);
  }

  /**
   * Get upstream node IDs for a given node
   */
  getUpstream(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.inEdges.map((e) => e.source);
  }
}
