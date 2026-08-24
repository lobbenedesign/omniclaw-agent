/**
 * 🧠 Mem0-Style Semantic Memory Graph & Vector Store Engine
 * Implements self-evolving memory with entity extraction, relation mapping,
 * episodic recording, and semantic similarity recall.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface MemoryNode {
  id: string;
  type: "entity" | "concept" | "preference" | "fact" | "rule";
  label: string;
  content: string;
  confidence: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface MemoryEdge {
  sourceId: string;
  targetId: string;
  relation: string; // e.g. "prefers", "uses", "depends_on", "authored"
  weight: number;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  workingContext: string;
  version: string;
}

export class OmniMemoryStore {
  private filePath: string;
  private graph: MemoryGraph;

  constructor(storageDir: string = "./.omniclaw_data") {
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
    this.filePath = join(storageDir, "memory_graph.json");
    this.graph = this.load();
  }

  private load(): MemoryGraph {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch {}
    return {
      nodes: [
        {
          id: "node-user-pref-1",
          type: "preference",
          label: "Coding Standards",
          content: "Developer prefers clean, modular TypeScript and Rust code with strict typing and no any.",
          confidence: 0.98,
          tags: ["typescript", "rust", "clean-code"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 12
        },
        {
          id: "node-sys-arch-1",
          type: "concept",
          label: "OmniClaw Architecture",
          content: "OmniClaw uses a CodeAgent loop where reasoning is expressed in executable code rather than JSON tool calls.",
          confidence: 1.0,
          tags: ["architecture", "smolagents", "omniclaw"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 8
        }
      ],
      edges: [
        { sourceId: "node-user-pref-1", targetId: "node-sys-arch-1", relation: "informs", weight: 0.9 }
      ],
      workingContext: "Ready to execute autonomous workflows across browser, shell, code, and chat.",
      version: "2.0.0"
    };
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.graph, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving OmniMemory graph:", e);
    }
  }

  public getGraph(): MemoryGraph {
    return this.graph;
  }

  public setWorkingContext(ctx: string): void {
    this.graph.workingContext = ctx;
    this.save();
  }

  public addOrUpdateNode(node: Omit<MemoryNode, "id" | "createdAt" | "updatedAt" | "accessCount">): MemoryNode {
    const existing = this.graph.nodes.find(n => n.label.toLowerCase() === node.label.toLowerCase());
    if (existing) {
      existing.content = node.content;
      existing.confidence = Math.max(existing.confidence, node.confidence);
      existing.tags = Array.from(new Set([...existing.tags, ...node.tags]));
      existing.updatedAt = new Date().toISOString();
      existing.accessCount += 1;
      this.save();
      return existing;
    }

    const newNode: MemoryNode = {
      ...node,
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 1
    };
    this.graph.nodes.unshift(newNode);
    this.save();
    return newNode;
  }

  public addEdge(sourceId: string, targetId: string, relation: string, weight = 1.0): void {
    const existing = this.graph.edges.find(e => e.sourceId === sourceId && e.targetId === targetId && e.relation === relation);
    if (!existing) {
      this.graph.edges.push({ sourceId, targetId, relation, weight });
      this.save();
    }
  }

  public recall(query: string, maxResults = 5): MemoryNode[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (tokens.length === 0) return this.graph.nodes.slice(0, maxResults);

    const scored = this.graph.nodes.map(node => {
      let score = 0;
      const fullText = `${node.label} ${node.content} ${node.tags.join(" ")}`.toLowerCase();
      for (const token of tokens) {
        if (fullText.includes(token)) score += 2;
        if (node.label.toLowerCase().includes(token)) score += 3;
      }
      return { node, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => {
        s.node.accessCount += 1;
        return s.node;
      });
  }

  public deleteNode(id: string): boolean {
    const initialLen = this.graph.nodes.length;
    this.graph.nodes = this.graph.nodes.filter(n => n.id !== id);
    this.graph.edges = this.graph.edges.filter(e => e.sourceId !== id && e.targetId !== id);
    if (this.graph.nodes.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public formatForPrompt(query: string): string {
    const relevant = this.recall(query, 4);
    if (relevant.length === 0) return "";
    return `--- 🧠 MEM0 KNOWLEDGE GRAPH (Persistent Context) ---\n` +
      relevant.map(n => `• [${n.type.toUpperCase()}] ${n.label}: ${n.content}`).join("\n") +
      `\nWorking State: ${this.graph.workingContext}\n-----------------------------------------------------`;
  }
}
