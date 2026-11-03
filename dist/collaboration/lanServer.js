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
class LanRoomServer {
    roomId;
    port;
    log;
    server;
    docs = new Map();
    clients = new Map();
    counter = 0;
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
        });
    }
    handle(socket) {
        let id = "";
        socket.on("message", raw => {
            try {
                const message = JSON.parse(raw.toString());
                if (message.type === "hello") {
                    if (message.roomId !== this.roomId) {
                        this.send(socket, { type: "error", message: "Room ID mismatch" });
                        socket.close();
                        return;
                    }
                    id = message.clientId;
                    const peer = { clientId: id, name: message.name || "Developer", color: protocol_1.PALETTE[this.counter++ % protocol_1.PALETTE.length], file: "", line: 0, column: 0, active: false };
                    this.clients.set(id, { ws: socket, peer });
                    this.send(socket, { type: "welcome", roomId: this.roomId, peers: [...this.clients.values()].map(c => c.peer), files: [...this.docs.keys()] });
                    this.broadcast({ type: "presence", peer }, id);
                    for (const [docPath, doc] of this.docs)
                        this.send(socket, { type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"), from: "host" });
                    this.log(`${peer.name} joined`);
                    return;
                }
                if (!id || !this.clients.has(id))
                    return;
                if (message.type === "update") {
                    const doc = this.getDoc(message.path);
                    Y.applyUpdate(doc, Buffer.from(message.update, "base64"), id);
                    this.broadcast({ type: "update", path: message.path, update: message.update, from: id }, id);
                }
                else if (message.type === "presence") {
                    const peer = this.clients.get(id).peer;
                    Object.assign(peer, { file: message.file, line: message.line, column: message.column, active: message.active });
                    this.broadcast({ type: "presence", peer }, id);
                }
                else if (message.type === "request-files")
                    this.send(socket, { type: "file-list", files: [...this.docs.keys()] });
                else if (message.type === "file-op")
                    this.broadcast({ type: "file-op", operation: message.operation, path: message.path, newPath: message.newPath }, id);
            }
            catch (error) {
                this.log(`Malformed message: ${String(error)}`);
            }
        });
        socket.on("close", () => { if (id) {
            this.clients.delete(id);
            this.broadcast({ type: "peer-left", clientId: id });
            this.log(`Peer left ${id.slice(0, 6)}`);
        } });
    }
    getDoc(docPath) { let doc = this.docs.get(docPath); if (!doc) {
        doc = new Y.Doc();
        this.docs.set(docPath, doc);
    } return doc; }
    send(socket, message) { if (socket.readyState === ws_1.WebSocket.OPEN)
        socket.send(JSON.stringify(message)); }
    broadcast(message, except) { for (const [id, client] of this.clients)
        if (id !== except)
            this.send(client.ws, message); }
    async stop() { for (const client of this.clients.values())
        client.ws.close(); this.clients.clear(); for (const doc of this.docs.values())
        doc.destroy(); this.docs.clear(); if (this.server)
        await new Promise(resolve => this.server.close(() => resolve())); this.server = undefined; }
}
exports.LanRoomServer = LanRoomServer;
