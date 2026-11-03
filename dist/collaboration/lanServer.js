"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanRoomServer = void 0;
const Y = __importStar(require("yjs"));
const ws_1 = require("ws");
const protocol_1 = require("../protocol");
const EXPIRE_MS = 60_000;
const blankSelection = () => ({ startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 });
class LanRoomServer {
    roomId;
    port;
    log;
    server;
    docs = new Map();
    clients = new Map();
    colors = new Map();
    expiry;
    constructor(roomId, port, log) {
        this.roomId = roomId;
        this.port = port;
        this.log = log;
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server = new ws_1.WebSocketServer({ host: "0.0.0.0", port: this.port, maxPayload: 8 * 1024 * 1024 });
            this.server.once("listening", () => { this.log(`Room ${this.roomId} listening on ${this.port}`); resolve(); });
            this.server.once("error", reject);
            this.server.on("connection", socket => this.handle(socket));
            this.expiry = setInterval(() => { const now = Date.now(); for (const [id, state] of this.clients)
                if (now - state.peer.lastActivity > EXPIRE_MS) {
                    state.ws.terminate();
                    this.removePeer(id, state.ws);
                } }, 5000);
        });
    }
    handle(socket) {
        let id = "";
        socket.on("message", raw => {
            try {
                const message = (0, protocol_1.validateClientMessage)(JSON.parse(raw.toString()));
                if (!message) {
                    socket.close(1008, "Invalid message");
                    return;
                }
                if (message.type === "hello") {
                    if (message.roomId !== this.roomId) {
                        this.send(socket, { type: "error", message: "Room ID mismatch" });
                        socket.close();
                        return;
                    }
                    id = message.clientId;
                    const old = this.clients.get(id);
                    if (old && old.ws !== socket)
                        old.ws.close();
                    const color = this.colors.get(id) ?? old?.peer.color ?? this.assignColor();
                    this.colors.set(id, color);
                    const peer = old ? { ...old.peer, name: message.name, lastActivity: Date.now(), idle: false } : { clientId: id, name: message.name.trim(), color, file: "", line: 0, column: 0, selection: blankSelection(), active: false, idle: false, lastActivity: Date.now() };
                    this.clients.set(id, { ws: socket, peer });
                    this.send(socket, { type: "welcome", roomId: this.roomId, peers: [...this.clients.values()].map(c => c.peer), files: [...this.docs.keys()] });
                    if (!old)
                        this.broadcast({ type: "participant-joined", peer }, id);
                    for (const [docPath, doc] of this.docs)
                        this.send(socket, { type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"), from: "host" });
                    this.log(`${peer.name} joined`);
                    return;
                }
                if (!id || !this.clients.has(id) || this.clients.get(id).ws !== socket)
                    return;
                const state = this.clients.get(id);
                state.peer.lastActivity = Date.now();
                if (message.type === "heartbeat")
                    return;
                if (message.type !== "participant-idle" && state.peer.idle) {
                    state.peer.idle = false;
                    this.broadcast({ type: "participant-idle", peer: state.peer }, id);
                }
                if (message.type === "update") {
                    const doc = this.getDoc(message.path);
                    Y.applyUpdate(doc, Buffer.from(message.update, "base64"), id);
                    this.broadcast({ type: "update", path: message.path, update: message.update, from: id }, id);
                }
                else if (message.type === "presence-update") {
                    const changed = state.peer.file !== message.file || state.peer.line !== message.line || state.peer.column !== message.column || state.peer.active !== message.active || JSON.stringify(state.peer.selection) !== JSON.stringify(message.selection);
                    if (!changed)
                        return;
                    Object.assign(state.peer, { file: message.file, line: message.line, column: message.column, selection: message.selection, active: message.active });
                    this.broadcast({ type: "presence-update", peer: state.peer }, id);
                }
                else if (message.type === "active-file-change") {
                    if (state.peer.file === message.file && state.peer.active === !!message.file)
                        return;
                    state.peer.file = message.file;
                    state.peer.active = !!message.file;
                    this.broadcast({ type: "active-file-change", peer: state.peer }, id);
                }
                else if (message.type === "cursor-update") {
                    const changed = state.peer.file !== message.file || state.peer.line !== message.line || state.peer.column !== message.column || JSON.stringify(state.peer.selection) !== JSON.stringify(message.selection);
                    if (!changed)
                        return;
                    Object.assign(state.peer, { file: message.file, line: message.line, column: message.column, selection: message.selection, active: true });
                    this.broadcast({ type: "cursor-update", peer: state.peer }, id);
                }
                else if (message.type === "participant-idle") {
                    if (state.peer.idle !== message.idle) {
                        state.peer.idle = message.idle;
                        this.broadcast({ type: "participant-idle", peer: state.peer }, id);
                    }
                }
                else if (message.type === "mouse-move")
                    this.broadcast({ type: "mouse-move", clientId: id, name: state.peer.name, color: state.peer.color, file: message.file, x: message.x, y: message.y }, id);
                else if (message.type === "mouse-leave")
                    this.broadcast({ type: "mouse-leave", clientId: id, file: message.file }, id);
                else if (message.type === "request-files")
                    this.send(socket, { type: "file-list", files: [...this.docs.keys()] });
                else if (message.type === "file-op")
                    this.broadcast({ type: "file-op", operation: message.operation, path: message.path, newPath: message.newPath }, id);
            }
            catch (error) {
                this.log(`Malformed message: ${String(error)}`);
            }
        });
        socket.on("close", () => { if (id)
            this.removePeer(id, socket); });
    }
    assignColor() { const counts = new Map(protocol_1.PALETTE.map(color => [color, 0])); for (const color of this.colors.values())
        counts.set(color, (counts.get(color) ?? 0) + 1); return protocol_1.PALETTE.find(color => counts.get(color) === 0) ?? protocol_1.PALETTE.reduce((a, b) => counts.get(a) <= counts.get(b) ? a : b); }
    removePeer(id, socket) { const current = this.clients.get(id); if (!current || current.ws !== socket)
        return; this.clients.delete(id); this.broadcast({ type: "participant-left", clientId: id }); this.log(`Peer left ${id.slice(0, 6)}`); }
    getDoc(docPath) { let doc = this.docs.get(docPath); if (!doc) {
        doc = new Y.Doc();
        this.docs.set(docPath, doc);
    } return doc; }
    send(socket, message) { if (socket.readyState === ws_1.WebSocket.OPEN)
        socket.send(JSON.stringify(message)); }
    broadcast(message, except) { for (const [id, client] of this.clients)
        if (id !== except)
            this.send(client.ws, message); }
    async stop() { if (this.expiry)
        clearInterval(this.expiry); this.expiry = undefined; for (const client of this.clients.values())
        client.ws.close(); this.clients.clear(); for (const doc of this.docs.values())
        doc.destroy(); this.docs.clear(); if (this.server)
        await new Promise(resolve => this.server.close(() => resolve())); this.server = undefined; }
}
exports.LanRoomServer = LanRoomServer;
