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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanRoomClient = void 0;
const Y = __importStar(require("yjs"));
const ws_1 = __importDefault(require("ws"));
class LanRoomClient {
    address;
    roomId;
    clientId;
    name;
    store;
    socket;
    docs = new Map();
    handlers = new Set();
    reconnectTimer;
    reconnectDelay = 1000;
    intentionallyClosed = false;
    connectedResolve;
    connectedReject;
    peers = [];
    onClosed;
    onConnectionChanged;
    constructor(address, roomId, clientId, name, store) {
        this.address = address;
        this.roomId = roomId;
        this.clientId = clientId;
        this.name = name;
        this.store = store;
    }
    onMessage(handler) { this.handlers.add(handler); return { dispose: () => this.handlers.delete(handler) }; }
    emit(message) { for (const handler of this.handlers)
        handler(message); }
    connect() {
        this.intentionallyClosed = false;
        return new Promise((resolve, reject) => { this.connectedResolve = resolve; this.connectedReject = reject; this.openSocket(); });
    }
    openSocket() {
        const socket = new ws_1.default(this.address.startsWith("ws://") ? this.address : `ws://${this.address}`);
        this.socket = socket;
        const timeout = setTimeout(() => { if (socket.readyState !== ws_1.default.OPEN) {
            socket.terminate();
            this.connectedReject?.(new Error("Connection timed out"));
        } }, 8000);
        socket.once("open", () => this.send({ type: "hello", roomId: this.roomId, clientId: this.clientId, name: this.name }));
        socket.on("message", raw => {
            let message;
            try {
                message = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            if (message.type === "welcome") {
                clearTimeout(timeout);
                this.peers = message.peers.filter(p => p.clientId !== this.clientId);
                this.reconnectDelay = 1000;
                this.connectedResolve?.();
                this.connectedResolve = undefined;
                this.onConnectionChanged?.(true);
                this.emit(message);
                for (const [docPath, doc] of this.docs)
                    this.send({ type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") });
            }
            else if (message.type === "update") {
                Y.applyUpdate(this.getDoc(message.path), Buffer.from(message.update, "base64"), "remote");
                this.emit(message);
            }
            else if ("peer" in message) {
                this.peers = [...this.peers.filter(p => p.clientId !== message.peer.clientId), message.peer];
                this.emit(message);
            }
            else if (message.type === "participant-left") {
                this.peers = this.peers.filter(p => p.clientId !== message.clientId);
                this.emit(message);
            }
            else
                this.emit(message);
        });
        socket.once("error", error => { clearTimeout(timeout); this.connectedReject?.(error); });
        socket.on("close", () => { this.onConnectionChanged?.(false); this.onClosed?.(); if (!this.intentionallyClosed)
            this.scheduleReconnect(); });
    }
    scheduleReconnect() { if (this.reconnectTimer || this.intentionallyClosed)
        return; this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; if (!this.intentionallyClosed)
        this.openSocket(); }, this.reconnectDelay); this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000); }
    getDoc(docPath) {
        let doc = this.docs.get(docPath);
        if (doc)
            return doc;
        doc = new Y.Doc();
        this.docs.set(docPath, doc);
        void this.store?.restore(docPath, doc).then(() => { if (this.socket?.readyState === ws_1.default.OPEN)
            this.send({ type: "update", path: docPath, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") }); });
        doc.on("update", (update, origin) => {
            if (origin !== "remote" && origin !== "persistence") {
                void this.store?.append(docPath, update);
            }
            if (origin !== "remote" && this.socket?.readyState === ws_1.default.OPEN)
                this.send({ type: "update", path: docPath, update: Buffer.from(update).toString("base64") });
        });
        return doc;
    }
    sendPresence(file, line, column, active, selection = { startLine: line, startColumn: column, endLine: line, endColumn: column }) { this.send({ type: "presence-update", file, line, column, active, selection, idle: false }); }
    sendActiveFile(file) { this.send({ type: "active-file-change", file }); }
    sendCursor(file, line, column, selection) { this.send({ type: "cursor-update", file, line, column, selection }); }
    sendIdle(idle) { this.send({ type: "participant-idle", idle }); }
    heartbeat() { this.send({ type: "heartbeat" }); }
    sendFileOperation(operation, docPath, newPath) { this.send({ type: "file-op", operation, path: docPath, newPath }); }
    send(message) { if (this.socket?.readyState === ws_1.default.OPEN)
        this.socket.send(JSON.stringify(message)); }
    close() { this.intentionallyClosed = true; if (this.reconnectTimer)
        clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; this.socket?.close(); for (const doc of this.docs.values())
        doc.destroy(); this.docs.clear(); }
}
exports.LanRoomClient = LanRoomClient;
