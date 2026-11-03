import * as Y from "yjs";
import WebSocket from "ws";
import { ClientMessage, ServerMessage, PeerInfo } from "../protocol";
import { UpdateStore } from "../persistence/updateStore";

type MessageHandler = (message: ServerMessage) => void;
export class LanRoomClient {
  private socket?: WebSocket;
  private docs = new Map<string, Y.Doc>();
  private handlers = new Set<MessageHandler>();
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectDelay = 1000;
  private intentionallyClosed = false;
  private connectedResolve?: () => void;
  private connectedReject?: (error: Error) => void;
  peers: PeerInfo[] = [];
  onClosed?: () => void;
  onConnectionChanged?: (connected: boolean) => void;
  constructor(readonly address: string, readonly roomId: string, readonly clientId: string, readonly name: string, private readonly store?: UpdateStore) {}
  onMessage(handler: MessageHandler): { dispose(): void } { this.handlers.add(handler); return { dispose: () => this.handlers.delete(handler) }; }
  private emit(message: ServerMessage): void { for (const handler of this.handlers) handler(message); }
  connect(): Promise<void> {
    this.intentionallyClosed = false;
    return new Promise((resolve, reject) => { this.connectedResolve = resolve; this.connectedReject = reject; this.openSocket(); });
  }
  private openSocket(): void {
    const socket = new WebSocket(this.address.startsWith("ws://") ? this.address : `ws://${this.address}`);
    this.socket = socket;
    const timeout = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) { socket.terminate(); this.connectedReject?.(new Error("Connection timed out")); } }, 8000);
    socket.once("open", () => this.send({ type: "hello", roomId: this.roomId, clientId: this.clientId, name: this.name }));
    socket.on("message", raw => {
      let message: ServerMessage; try { message = JSON.parse(raw.toString()) as ServerMessage; } catch { return; }
      if (message.type === "welcome") { clearTimeout(timeout); this.peers = message.peers.filter(p => p.clientId !== this.clientId); this.reconnectDelay = 1000; this.connectedResolve?.(); this.connectedResolve = undefined; this.onConnectionChanged?.(true);
        this.emit(message);
        for (const [docPath, doc] of this.docs) this.send({ type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") });
      } else if (message.type === "update") { Y.applyUpdate(this.getDoc(message.path), Buffer.from(message.update, "base64"), "remote"); this.emit(message); }
      else if ("peer" in message) { this.peers = [...this.peers.filter(p => p.clientId !== message.peer.clientId), message.peer]; this.emit(message); }
      else if (message.type === "participant-left") { this.peers = this.peers.filter(p => p.clientId !== message.clientId); this.emit(message); }
      else this.emit(message);
    });
    socket.once("error", error => { clearTimeout(timeout); this.connectedReject?.(error as Error); });
    socket.on("close", () => { this.onConnectionChanged?.(false); this.onClosed?.(); if (!this.intentionallyClosed) this.scheduleReconnect(); });
  }
  private scheduleReconnect(): void { if (this.reconnectTimer || this.intentionallyClosed) return; this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; if (!this.intentionallyClosed) this.openSocket(); }, this.reconnectDelay); this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000); }
  getDoc(docPath: string): Y.Doc {
    let doc = this.docs.get(docPath); if (doc) return doc;
    doc = new Y.Doc(); this.docs.set(docPath, doc);
    void this.store?.restore(docPath, doc).then(() => { if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc!)).toString("base64") }); });
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote" && origin !== "persistence") { void this.store?.append(docPath, update); }
      if (origin !== "remote" && this.socket?.readyState === WebSocket.OPEN) this.send({ type: "update", path: docPath, update: Buffer.from(update).toString("base64") });
    });
    return doc;
  }
  sendPresence(file: string, line: number, column: number, active: boolean, selection = { startLine: line, startColumn: column, endLine: line, endColumn: column }): void { this.send({ type: "presence-update", file, line, column, active, selection, idle: false }); }
  sendActiveFile(file: string): void { this.send({ type: "active-file-change", file }); }
  sendCursor(file: string, line: number, column: number, selection: { startLine: number; startColumn: number; endLine: number; endColumn: number }): void { this.send({ type: "cursor-update", file, line, column, selection }); }
  sendIdle(idle: boolean): void { this.send({ type: "participant-idle", idle }); }
  heartbeat(): void { this.send({ type: "heartbeat" }); }
  sendFileOperation(operation: "delete" | "rename", docPath: string, newPath?: string): void { this.send({ type: "file-op", operation, path: docPath, newPath }); }
  private send(message: ClientMessage): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  close(): void { this.intentionallyClosed = true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; this.socket?.close(); for (const doc of this.docs.values()) doc.destroy(); this.docs.clear(); }
}
