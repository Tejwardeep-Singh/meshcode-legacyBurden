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
exports.LanDiscovery = void 0;
exports.getLanIPv4Addresses = getLanIPv4Addresses;
const dgram = __importStar(require("node:dgram"));
const os = __importStar(require("node:os"));
const PORT = 48766;
function getLanIPv4Addresses() { const a = []; for (const entries of Object.values(os.networkInterfaces()))
    for (const e of entries ?? [])
        if (e.family === "IPv4" && !e.internal)
            a.push(e.address); return a; }
class LanDiscovery {
    socket;
    timer;
    async announce(room) { await this.stop(); this.socket = dgram.createSocket("udp4"); await new Promise((res, rej) => { this.socket.once("error", rej); this.socket.bind(0, () => { this.socket.setBroadcast(true); res(); }); }); const send = () => this.socket?.send(Buffer.from(JSON.stringify({ ...room, kind: "meshcode-room" })), PORT, "255.255.255.255"); send(); this.timer = setInterval(send, 2500); }
    async discover(ms = 3000) { const s = dgram.createSocket({ type: "udp4", reuseAddr: true }); const found = new Map(); await new Promise((res, rej) => { s.once("error", rej); s.bind(PORT, "0.0.0.0", () => { s.on("message", (b, info) => { try {
        const x = JSON.parse(b.toString());
        if (x.kind === "meshcode-room") {
            x.host = info.address;
            found.set(`${x.roomId}@${x.host}`, x);
        }
    }
    catch { } }); setTimeout(() => { s.close(); res(); }, ms); }); }); return [...found.values()]; }
    async stop() { if (this.timer)
        clearInterval(this.timer); this.timer = undefined; if (this.socket) {
        const s = this.socket;
        this.socket = undefined;
        await new Promise(r => s.close(() => r()));
    } }
}
exports.LanDiscovery = LanDiscovery;
