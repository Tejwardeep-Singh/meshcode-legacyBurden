import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Y from "yjs";

/** Append-only local Yjs update store. Updates are persisted before network delivery. */
export class UpdateStore {
  constructor(private readonly root: string) {}
  private fileFor(docPath: string): string {
    const safe = Buffer.from(docPath.replace(/\\/g, "/")).toString("base64url");
    return path.join(this.root, `${safe}.updates`);
  }
  async append(docPath: string, update: Uint8Array): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.appendFile(this.fileFor(docPath), Buffer.from(update).toString("base64") + "\n", "utf8");
  }
  async restore(docPath: string, doc: Y.Doc): Promise<void> {
    try {
      const data = await fs.readFile(this.fileFor(docPath), "utf8");
      for (const line of data.split("\n")) if (line) Y.applyUpdate(doc, Buffer.from(line, "base64"), "persistence");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  async paths(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.root);
      return files.filter(f => f.endsWith(".updates")).map(f => Buffer.from(f.slice(0, -8), "base64url").toString("utf8"));
    } catch { return []; }
  }
}
