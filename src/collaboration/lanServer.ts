import * as Y from "yjs";
import { WebSocketServer, WebSocket } from "ws";
import { ClientMessage, ServerMessage, PeerInfo, PALETTE } from "../protocol";
interface ClientState { ws: WebSocket; peer: PeerInfo; }
export class LanRoomServer {
  private server?: WebSocketServer; private docs = new Map<string, Y.Doc>(); private clients = new Map<string, ClientState>(); private counter = 0;
  constructor(readonly roomId: string, readonly port: number, private log: (message: string) => void) {}
  start(): Promise<void> { return new Promise((resolve, reject) => {
    this.server = new WebSocketServer({ host: "0.0.0.0", port: this.port, maxPayload: 8 * 1024 * 1024 });
    this.server.once("listening", () => { this.log(`Room ${this.roomId} listening on ${this.port}`); resolve(); });
    this.server.once("error", reject); this.server.on("connection", socket => this.handle(socket));
  }); }
  private handle(socket: WebSocket): void { let id = "";
    socket.on("message", raw => { try { const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === "hello") {
        if (message.roomId !== this.roomId) { this.send(socket, { type: "error", message: "Room ID mismatch" }); socket.close(); return; }
        id = message.clientId; const peer: PeerInfo = { clientId: id, name: message.name || "Developer", color: PALETTE[this.counter++ % PALETTE.length], file: "", line: 0, column: 0, active: false };
        this.clients.set(id, { ws: socket, peer }); this.send(socket, { type: "welcome", roomId: this.roomId, peers: [...this.clients.values()].map(c => c.peer), files: [...this.docs.keys()] });
        this.broadcast({ type: "presence", peer }, id); for (const [docPath, doc] of this.docs) this.send(socket, { type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"), from: "host" });
        this.log(`${peer.name} joined`); return;
      }
      if (!id || !this.clients.has(id)) return;
      if (message.type === "update") { const doc = this.getDoc(message.path); Y.applyUpdate(doc, Buffer.from(message.update, "base64"), id); this.broadcast({ type: "update", path: message.path, update: message.update, from: id }, id); }
      else if (message.type === "presence") { const peer = this.clients.get(id)!.peer; Object.assign(peer, { file: message.file, line: message.line, column: message.column, active: message.active }); this.broadcast({ type: "presence", peer }, id); }
      else if (message.type === "request-files") this.send(socket, { type: "file-list", files: [...this.docs.keys()] });
      else if (message.type === "file-op") this.broadcast({ type: "file-op", operation: message.operation, path: message.path, newPath: message.newPath }, id);
    } catch (error) { this.log(`Malformed message: ${String(error)}`); } });
    socket.on("close", () => { if (id) { this.clients.delete(id); this.broadcast({ type: "peer-left", clientId: id }); this.log(`Peer left ${id.slice(0, 6)}`); } });
  }
  private getDoc(docPath: string): Y.Doc { let doc = this.docs.get(docPath); if (!doc) { doc = new Y.Doc(); this.docs.set(docPath, doc); } return doc; }
  private send(socket: WebSocket, message: ServerMessage): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
  private broadcast(message: ServerMessage, except?: string): void { for (const [id, client] of this.clients) if (id !== except) this.send(client.ws, message); }
  async stop(): Promise<void> { for (const client of this.clients.values()) client.ws.close(); this.clients.clear(); for (const doc of this.docs.values()) doc.destroy(); this.docs.clear(); if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve())); this.server = undefined; }
}
