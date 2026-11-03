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
exports.CollaboratorFileDecorations = exports.PresenceManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
class PresenceManager {
    types = new Map();
    update(peers) {
        for (const editor of vscode.window.visibleTextEditors) {
            const relative = this.relative(editor.document.uri);
            const relevant = peers.filter(p => p.active && !p.idle && p.file === relative);
            const active = new Set();
            for (const peer of relevant) {
                if (!Number.isInteger(peer.line) || peer.line < 0 || peer.line >= editor.document.lineCount || peer.column < 0 || peer.column > editor.document.lineAt(peer.line).text.length || peer.selection.startLine >= editor.document.lineCount || peer.selection.endLine >= editor.document.lineCount)
                    continue;
                active.add(peer.clientId);
                const type = this.get(peer);
                const pos = new vscode.Position(Math.min(peer.line, editor.document.lineCount - 1), Math.min(peer.column, editor.document.lineAt(Math.min(peer.line, editor.document.lineCount - 1)).text.length));
                const s = peer.selection;
                const startLine = Math.min(s.startLine, editor.document.lineCount - 1), endLine = Math.min(s.endLine, editor.document.lineCount - 1);
                const start = new vscode.Position(startLine, Math.min(s.startColumn, editor.document.lineAt(startLine).text.length));
                const end = new vscode.Position(endLine, Math.min(s.endColumn, editor.document.lineAt(endLine).text.length));
                const decorations = [{ range: new vscode.Range(pos, pos), hoverMessage: new vscode.MarkdownString(`**${peer.name}** · ${peer.idle ? "Idle" : "Editing"}`), renderOptions: { after: { contentText: ` ${peer.name} `, color: contrastText(peer.color), backgroundColor: peer.color, margin: "0 0 0 4px", border: "1px solid", borderColor: peer.color } } }];
                if (!start.isEqual(end))
                    decorations.push({ range: new vscode.Range(start, end), hoverMessage: new vscode.MarkdownString(`**${peer.name}** selected this text`) });
                editor.setDecorations(type, decorations);
            }
            for (const [id, type] of this.types)
                if (!active.has(id))
                    editor.setDecorations(type, []);
        }
    }
    relative(uri) { const folder = vscode.workspace.getWorkspaceFolder(uri); return folder ? path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/") : ""; }
    get(peer) {
        let type = this.types.get(peer.clientId);
        if (!type) {
            type = vscode.window.createTextEditorDecorationType({ borderStyle: "solid", borderWidth: "0 0 0 2px", borderColor: peer.color, backgroundColor: new vscode.ThemeColor("editor.selectionBackground"), before: { contentText: "▏", color: peer.color, margin: "0 1px 0 0" }, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
            this.types.set(peer.clientId, type);
        }
        return type;
    }
    dispose() { for (const type of this.types.values())
        type.dispose(); this.types.clear(); }
}
exports.PresenceManager = PresenceManager;
function contrastText(hex) { const c = hex.replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(c))
    return "#ffffff"; const channels = [0, 2, 4].map(i => { const n = parseInt(c.slice(i, i + 2), 16) / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.35 ? "#111111" : "#ffffff"; }
class CollaboratorFileDecorations {
    getPeers;
    emitter = new vscode.EventEmitter();
    onDidChangeFileDecorations = this.emitter.event;
    previouslyNotified = new Map();
    constructor(getPeers) {
        this.getPeers = getPeers;
    }
    provideFileDecoration(uri) {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder)
            return;
        const rel = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
        const peers = this.getPeers().filter(p => p.active && p.file === rel);
        if (!peers.length)
            return;
        const names = peers.map(p => `${p.name} (${p.color})`).join(", ");
        return new vscode.FileDecoration(String(Math.min(peers.length, 9)), `${peers.length} collaborator${peers.length === 1 ? "" : "s"}: ${names}`, new vscode.ThemeColor("charts.blue"));
    }
    refresh() { const current = new Map(); const folders = vscode.workspace.workspaceFolders ?? []; for (const folder of folders)
        for (const peer of this.getPeers())
            if (peer.file) {
                const uri = vscode.Uri.joinPath(folder.uri, ...peer.file.split("/"));
                current.set(uri.toString(), uri);
            } this.emitter.fire([...new Map([...this.previouslyNotified, ...current]).values()]); this.previouslyNotified = current; }
    dispose() { this.previouslyNotified.clear(); this.emitter.dispose(); }
}
exports.CollaboratorFileDecorations = CollaboratorFileDecorations;
