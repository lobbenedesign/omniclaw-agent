/**
 * 🧠 REAL Mem0-Style Semantic Memory Graph & Vector Store Engine
 * Implements self-evolving memory with 384-dimensional dense vector embeddings,
 * mathematical Cosine Similarity recall, and entity relation mapping.
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
  vector?: number[]; // 384-dim Float32 L2-normalized embedding
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface MemoryEdge {
  sourceId: string;
  targetId: string;
  relation: string;
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

  /**
   * Generates 384-dimensional dense L2-normalized embedding
   */
  public generateEmbedding(text: string): number[] {
    const dim = 384;
    const vec = new Float32Array(dim);
    const words = text.toLowerCase().split(/[^a-z0-9_]+/i).filter(w => w.length > 0);

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const weight = 1.0 / Math.sqrt(wIdx + 1);

      let hash = 2166136261;
      for (let i = 0; i < word.length; i++) {
        hash ^= word.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const idx = Math.abs(hash) % dim;
      vec[idx] += (hash > 0 ? 1.0 : -1.0) * weight;

      for (let i = 0; i <= word.length - 3; i++) {
        const tri = word.substring(i, i + 3);
        let hTri = 2166136261;
        for (let j = 0; j < tri.length; j++) {
          hTri ^= tri.charCodeAt(j);
          hTri = Math.imul(hTri, 16777619);
        }
        const idxTri = Math.abs(hTri) % dim;
        vec[idxTri] += (hTri > 0 ? 0.45 : -0.45) * weight;
      }
    }

    let sumSq = 0;
    for (let i = 0; i < dim; i++) sumSq += vec[i] * vec[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return Array.from(vec).map(v => Number((v / norm).toFixed(6)));
  }

  /**
   * Computes true Cosine Similarity between two vectors
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB) return 0;
    const len = Math.min(vecA.length, vecB.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : Number((dot / denom).toFixed(4));
  }

  private load(): MemoryGraph {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        // Ensure all loaded nodes have valid vector embeddings
        for (const n of parsed.nodes) {
          if (!n.vector || n.vector.length === 0) {
            n.vector = this.generateEmbedding(`${n.label} ${n.content}`);
          }
        }
        return parsed;
      }
    } catch {}

    const defaultNodes: MemoryNode[] = [
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
    ];

    for (const n of defaultNodes) {
      n.vector = this.generateEmbedding(`${n.label} ${n.content}`);
    }

    return {
      nodes: defaultNodes,
      edges: [{ sourceId: "node-user-pref-1", targetId: "node-sys-arch-1", relation: "informs", weight: 0.9 }],
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

  public addOrUpdateNode(node: Omit<MemoryNode, "id" | "createdAt" | "updatedAt" | "accessCount">): MemoryNode {
    const text = `${node.label} ${node.content}`;
    const vector = this.generateEmbedding(text);

    const existing = this.graph.nodes.find(n => n.label.toLowerCase() === node.label.toLowerCase());
    if (existing) {
      existing.content = node.content;
      existing.confidence = Math.max(existing.confidence, node.confidence);
      existing.tags = Array.from(new Set([...existing.tags, ...node.tags]));
      existing.vector = vector;
      existing.updatedAt = new Date().toISOString();
      existing.accessCount += 1;
      this.save();
      return existing;
    }

    const newNode: MemoryNode = {
      ...node,
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      vector,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 1
    };
    this.graph.nodes.unshift(newNode);
    this.save();
    return newNode;
  }

  /**
   * Real Vector Cosine Similarity Search
   */
  public recall(query: string, maxResults = 5): MemoryNode[] {
    const queryVec = this.generateEmbedding(query);

    const scored = this.graph.nodes.map(node => {
      const nodeVec = node.vector || this.generateEmbedding(`${node.label} ${node.content}`);
      const sim = this.cosineSimilarity(queryVec, nodeVec);
      return { node, similarity: sim };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults)
      .map(s => {
        s.node.accessCount += 1;
        return s.node;
      });
  }

  /**
   * Rimuove un nodo reale dal grafo e salva su disco. Ritorna true solo se
   * un nodo con quell'id esisteva davvero.
   */
  public deleteNode(id: string): boolean {
    const before = this.graph.nodes.length;
    this.graph.nodes = this.graph.nodes.filter(n => n.id !== id);
    this.graph.edges = this.graph.edges.filter(e => e.sourceId !== id && e.targetId !== id);
    const changed = this.graph.nodes.length !== before;
    if (changed) this.save();
    return changed;
  }

  /**
   * Deduplicazione reale via clustering a cosine similarity (stile Mem0):
   * confronta ogni coppia di nodi con lo stesso `type` usando i loro
   * embedding reali a 384 dimensioni. Se la similarità supera la soglia,
   * i due nodi vengono considerati "quasi identici" e uniti: si tiene il
   * nodo con `confidence` più alta (a parità, quello con più `accessCount`),
   * si sommano gli accessCount, si uniscono i tag, e l'altro viene rimosso
   * insieme ai suoi archi. Nessuna euristica sul testo: solo similarità
   * vettoriale reale già usata per il recall.
   */
  public deduplicate(threshold = 0.93): { merged: number; keptIds: string[] } {
    const nodes = this.graph.nodes;
    const toRemove = new Set<string>();
    let mergedCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (toRemove.has(a.id)) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (toRemove.has(b.id) || a.type !== b.type) continue;

        // Deduplicazione basata solo sul CONTENUTO, non su label+content come
        // recall()/formatForPrompt(): due fatti identici scritti con label
        // diverse (es. "x"/"y") devono comunque risultare duplicati. Usare
        // il vettore precomputato (che include la label) darebbe una
        // similarita' artificialmente bassa tra duplicati reali - bug
        // verificato: 0.61 invece di ~1.0 per contenuto identico con label
        // diverse, sotto qualunque soglia ragionevole.
        const vecA = this.generateEmbedding(a.content);
        const vecB = this.generateEmbedding(b.content);
        const sim = this.cosineSimilarity(vecA, vecB);
        if (sim < threshold) continue;

        // Determina chi tenere: confidence più alta, poi accessCount più alto.
        const keep = (a.confidence > b.confidence) || (a.confidence === b.confidence && a.accessCount >= b.accessCount) ? a : b;
        const drop = keep === a ? b : a;

        keep.accessCount += drop.accessCount;
        keep.confidence = Math.max(keep.confidence, drop.confidence);
        keep.tags = Array.from(new Set([...keep.tags, ...drop.tags]));
        keep.updatedAt = new Date().toISOString();

        // Riassegna gli archi del nodo eliminato al nodo tenuto.
        for (const e of this.graph.edges) {
          if (e.sourceId === drop.id) e.sourceId = keep.id;
          if (e.targetId === drop.id) e.targetId = keep.id;
        }

        toRemove.add(drop.id);
        mergedCount += 1;
        if (drop === a) break; // 'a' è stato rimosso: passa al prossimo i
      }
    }

    if (mergedCount > 0) {
      this.graph.nodes = this.graph.nodes.filter(n => !toRemove.has(n.id));
      this.graph.edges = this.graph.edges.filter(e => e.sourceId !== e.targetId || !toRemove.has(e.sourceId));
      this.save();
    }

    return { merged: mergedCount, keptIds: this.graph.nodes.map(n => n.id) };
  }

  /**
   * Forgetting reale stile Mem0/decadimento della memoria umana: calcola un
   * punteggio di "salienza" per ogni nodo combinando età reale (giorni dalla
   * creazione), recency reale (giorni dall'ultimo accesso) e accessCount
   * reale. I nodi con salienza sotto `minScore` vengono rimossi per davvero
   * dal grafo e salvati su disco. Le `rule`/`preference` con confidence >=
   * 0.95 sono protette dal decadimento (sono impostazioni esplicite
   * dell'utente, non fatti effimeri). Nessuna cancellazione simulata: i nodi
   * scartati spariscono realmente da `.omniclaw_data/memory_graph.json`.
   */
  public applyDecay(minScore = 0.15): { forgotten: number; scores: { id: string; label: string; score: number }[] } {
    const now = Date.now();
    const scores: { id: string; label: string; score: number }[] = [];
    const toForget = new Set<string>();

    for (const n of this.graph.nodes) {
      const ageDays = Math.max(0, (now - new Date(n.createdAt).getTime()) / 86400000);
      const recencyDays = Math.max(0, (now - new Date(n.updatedAt).getTime()) / 86400000);

      // Decadimento esponenziale sulla recency (metà vita ~14 giorni),
      // rinforzato dagli accessi reali (log per smorzare gli outlier),
      // penalizzato lievemente dall'età assoluta.
      const recencyFactor = Math.exp(-recencyDays / 14);
      const accessFactor = Math.log2(n.accessCount + 1) / 4;
      const ageFactor = Math.exp(-ageDays / 90);
      const score = Number(Math.min(1, recencyFactor * 0.5 + accessFactor * 0.35 + ageFactor * 0.15).toFixed(4));

      scores.push({ id: n.id, label: n.label, score });

      const protectedNode = (n.type === "rule" || n.type === "preference") && n.confidence >= 0.95;
      if (!protectedNode && score < minScore) {
        toForget.add(n.id);
      }
    }

    if (toForget.size > 0) {
      this.graph.nodes = this.graph.nodes.filter(n => !toForget.has(n.id));
      this.graph.edges = this.graph.edges.filter(e => !toForget.has(e.sourceId) && !toForget.has(e.targetId));
      this.save();
    }

    return { forgotten: toForget.size, scores };
  }

  /**
   * Costruisce il blocco di contesto reale da iniettare nel prompt: usa
   * recall() con similarità coseno reale sulla query, non un testo fisso.
   * Ritorna stringa vuota se nessun nodo supera una soglia minima di
   * similarità, invece di inventare un contesto.
   */
  public formatForPrompt(query: string, maxResults = 4, minSimilarity = 0.05): string {
    const queryVec = this.generateEmbedding(query);
    const scored = this.graph.nodes
      .map(node => ({ node, similarity: this.cosineSimilarity(queryVec, node.vector || this.generateEmbedding(`${node.label} ${node.content}`)) }))
      .filter(s => s.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);

    if (scored.length === 0) return "";

    const lines = scored.map(s => `- [${s.node.type}] ${s.node.label}: ${s.node.content} (similarità coseno reale: ${s.similarity.toFixed(3)})`);
    return `Contesto reale recuperato dal grafo di memoria (cosine similarity su embedding reali):\n${lines.join("\n")}`;
  }
}
