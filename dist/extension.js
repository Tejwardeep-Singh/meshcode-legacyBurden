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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("node:crypto"));
const lanServer_1 = require("./collaboration/lanServer");
const lanClient_1 = require("./collaboration/lanClient");
const lanDiscovery_1 = require("./discovery/lanDiscovery");
const workspaceSync_1 = require("./sync/workspaceSync");
const presence_1 = require("./presence/presence");
const meshTerminal_1 = require("./terminal/meshTerminal");
const presence_2 = require("./presence/presence");
const updateStore_1 = require("./persistence/updateStore");
let server, client, syncer, discovery, presence, fileDecorations;
let output, status, roomId = "", roomAddress = "", peers = [], terminal, store;
let cursorTimer, cursorPending;
let heartbeatTimer, idleTimer;
function cursorThrottle(action) { cursorPending = action; if (cursorTimer)
    return; cursorTimer = setTimeout(() => { cursorTimer = undefined; cursorPending?.(); cursorPending = undefined; }, 34); }
function noteActivity() { if (idleTimer)
    clearTimeout(idleTimer); client?.sendIdle(false); idleTimer = setTimeout(() => client?.sendIdle(true), 60_000); }
function log(s) { output.appendLine(`[${new Date().toLocaleTimeString()}] ${s}`); }
async function askName(context, title) { const preferred = context.globalState.get("preferredDisplayName") || vscode.workspace.getConfiguration("meshcode").get("displayName", "Developer"); const value = await vscode.window.showInputBox({ title, prompt: "Name shown to everyone in this room", value: preferred, ignoreFocusOut: true, validateInput: v => v.trim() ? undefined : "Display name cannot be empty." }); if (value?.trim())
    await context.globalState.update("preferredDisplayName", value.trim()); return value?.trim(); }
function statusUpdate() { status.text = client ? `$(radio-tower) MeshCode: ${peers.length} peers` : server ? "$(broadcast) MeshCode: Hosting" : "$(circle-outline) MeshCode: Offline"; status.tooltip = client ? `Room ${roomId} · ${roomAddress}` : "No active session"; status.show(); }
async function leave(stopHost = true) { if (heartbeatTimer)
    clearInterval(heartbeatTimer); heartbeatTimer = undefined; if (idleTimer)
    clearTimeout(idleTimer); idleTimer = undefined; client?.sendPresence("", 0, 0, false); syncer?.dispose(); syncer = undefined; presence?.dispose(); presence = undefined; client?.close(); client = undefined; peers = []; fileDecorations?.refresh(); if (stopHost && discovery) {
    await discovery.stop();
    discovery = undefined;
} if (stopHost && server) {
    await server.stop();
    server = undefined;
} statusUpdate(); return "Left MeshCode session."; }
async function join(address, id, name) {
    await leave(false);
    if (!name.trim())
        throw new Error("Display name cannot be empty.");
    client = new lanClient_1.LanRoomClient(address, id, crypto.randomUUID(), name.trim(), store);
    await client.connect();
    heartbeatTimer = setInterval(() => client?.heartbeat(), 20_000);
    noteActivity();
    roomId = id;
    roomAddress = address;
    syncer = new workspaceSync_1.WorkspaceSync(client, output);
    presence = new presence_1.PresenceManager();
    client.onMessage(m => { if (m.type === "welcome")
        peers = m.peers.filter(p => p.clientId !== client?.clientId);
    else if ("peer" in m)
        peers = [...peers.filter(p => p.clientId !== m.peer.clientId), m.peer];
    else if (m.type === "participant-left")
        peers = peers.filter(p => p.clientId !== m.clientId); presence?.update(peers); fileDecorations?.refresh(); });
    client.onConnectionChanged = connected => { log(connected ? "LAN connection restored; synchronizing local updates" : "LAN connection lost; local editing and persistence remain available"); if (connected && syncer)
        syncer.publishPresence(); statusUpdate(); };
    client.onClosed = () => { log("LAN connection closed"); statusUpdate(); };
    peers = client.peers.filter(p => p.clientId !== client.clientId);
    statusUpdate();
    return `Joined ${id} at ${address}. WAN internet is not needed while this LAN path remains available.`;
}
function activate(context) {
    output = vscode.window.createOutputChannel("MeshCode");
    store = new updateStore_1.UpdateStore(context.globalStorageUri.fsPath);
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    fileDecorations = new presence_2.CollaboratorFileDecorations(() => peers);
    context.subscriptions.push(output, status, fileDecorations, vscode.window.registerFileDecorationProvider(fileDecorations));
    statusUpdate();
    const openTerminal = () => {
        const pty = new meshTerminal_1.MeshTerminal({
            create: async () => { if (server)
                return `Already hosting ${roomId}`; const name = await askName(context, "Create MeshCode room"); if (!name)
                return "Room creation cancelled."; const roomName = (await vscode.window.showInputBox({ prompt: "Optional room name", placeHolder: "My team session" }))?.trim() || "MeshCode"; const port = vscode.workspace.getConfiguration("meshcode").get("port", 48765); roomId = crypto.randomBytes(3).toString("hex").toUpperCase(); server = new lanServer_1.LanRoomServer(roomId, port, log); await server.start(); discovery = new lanDiscovery_1.LanDiscovery(); await discovery.announce({ roomId, host: "", port, name: roomName }); const ips = (0, lanDiscovery_1.getLanIPv4Addresses)(); roomAddress = `${ips[0] ?? "localhost"}:${port}`; await join(`127.0.0.1:${port}`, roomId, name); return `Hosting room ${roomId} (${roomName})\\nShare one of these LAN addresses:\\n${ips.map(ip => `  ${ip}:${port}`).join("\\n")}\\nKeep this VS Code window open.`; },
            discover: async () => { const d = new lanDiscovery_1.LanDiscovery(); const rooms = await d.discover(); await d.stop(); return rooms.length ? rooms.map(r => `${r.roomId}  ${r.host}:${r.port}  ${r.name}`).join("\\n") : "No rooms found. Check same Wi-Fi, firewall, and client isolation. Direct join is available."; },
            join: async (address) => { const name = await askName(context, "Join MeshCode room"); if (!name)
                return "Join cancelled."; const host = address.includes(":") ? address : `${address}:48765`; const id = await vscode.window.showInputBox({ prompt: "Enter room ID shown by host" }); return id ? join(host, id.trim().toUpperCase(), name) : "Join cancelled."; },
            status: () => client ? `Room: ${roomId}\\nAddress: ${roomAddress}\\nPeers: ${peers.length}\\nTransport: LAN WebSocket relay\\nWAN dependency after joining: none` : server ? `Hosting ${roomId}` : "No active room.",
            participants: () => peers.length ? peers.map(p => `${p.color} ${p.name}${p.active ? ` — ${p.file}:${p.line + 1}` : ""}${p.idle ? " (idle)" : ""}`).join("\\n") : "No other participants reported yet.",
            share: async () => { if (!syncer)
                return "Create or join a room first."; const n = await syncer.shareWorkspace(); return `Shared ${n} eligible text files (exclusions applied).`; },
            leave: async () => leave()
        });
        terminal = vscode.window.createTerminal({ name: "MeshCode", pty });
        terminal.show();
    };
    context.subscriptions.push(vscode.commands.registerCommand("meshcode.openTerminal", openTerminal), vscode.commands.registerCommand("meshcode.createRoom", () => { openTerminal(); vscode.window.showInformationMessage("Run `meshcode create` in the MeshCode terminal."); }), vscode.commands.registerCommand("meshcode.discoverRooms", async () => { const d = new lanDiscovery_1.LanDiscovery(); const rooms = await d.discover(); await d.stop(); const selected = await vscode.window.showQuickPick(rooms.map(r => ({ label: `${r.roomId} — ${r.name}`, description: `${r.host}:${r.port}`, room: r }))); if (selected)
        vscode.window.showInformationMessage(`In MeshCode terminal run: meshcode join ${selected.room.host}:${selected.room.port} (room ${selected.room.roomId})`); }), vscode.commands.registerCommand("meshcode.showStatus", () => vscode.window.showInformationMessage(client ? `Room ${roomId} · ${peers.length} peers · LAN` : "MeshCode is not connected.")), vscode.commands.registerCommand("meshcode.leaveRoom", async () => vscode.window.showInformationMessage(await leave())), vscode.window.onDidChangeTextEditorSelection(e => { if (client) {
        noteActivity();
        const e0 = e.textEditor, sel = e0.selection, rel = syncer?.relativePath(e0.document.uri);
        if (rel) {
            cursorThrottle(() => { syncer?.publishPresence(e0); client?.sendCursor(rel, sel.active.line, sel.active.character, { startLine: sel.start.line, startColumn: sel.start.character, endLine: sel.end.line, endColumn: sel.end.character }); presence?.update(peers); });
        }
    } }), vscode.window.onDidChangeActiveTextEditor(e => { if (client) {
        const file = e ? syncer?.relativePath(e.document.uri) ?? "" : "";
        client.sendActiveFile(file);
        if (!file)
            client.sendPresence("", 0, 0, false);
        else
            syncer?.publishPresence(e);
        presence?.update(peers);
    } }));
    fileDecorations.refresh();
    log("MeshCode activated. Run MeshCode: Open Terminal.");
}
function deactivate() { if (cursorTimer)
    clearTimeout(cursorTimer); void leave(); }
