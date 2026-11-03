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
exports.WorkspaceSync = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css", ".scss", ".md", ".txt", ".py", ".java", ".c", ".h", ".cpp", ".go", ".rs", ".php", ".rb", ".sh", ".yaml", ".yml", ".toml", ".xml", ".sql", ".vue", ".svelte"]);
class WorkspaceSync {
    client;
    log;
    subscriptions = [];
    applying = new Set();
    known = new Set();
    constructor(client, log) {
        this.client = client;
        this.log = log;
        this.subscriptions.push(client.onMessage(message => void this.handleMessage(message)));
        this.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => void this.shareDocument(document)));
        this.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => this.localChange(event)));
        this.subscriptions.push(vscode.workspace.onDidCreateFiles(event => { for (const uri of event.files)
            void this.shareUri(uri); }));
        this.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => { for (const uri of event.files) {
            const rel = this.relative(uri);
            if (rel)
                this.client.sendFileOperation("delete", rel);
        } }));
        this.subscriptions.push(vscode.workspace.onDidRenameFiles(event => { for (const file of event.files) {
            const oldPath = this.relative(file.oldUri), newPath = this.relative(file.newUri);
            if (oldPath && newPath)
                this.client.sendFileOperation("rename", oldPath, newPath);
        } }));
    }
    relativePath(uri) { const folder = vscode.workspace.getWorkspaceFolder(uri); return folder ? path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/") : undefined; }
    relative(uri) { return this.relativePath(uri); }
    allowed(relative) { const cfg = vscode.workspace.getConfiguration("meshcode"); const folders = cfg.get("excludedFolders", []); const files = cfg.get("excludedFiles", []); const parts = relative.split("/"); if (parts.some(part => folders.includes(part)))
        return false; const base = parts.at(-1) ?? ""; if (files.some(pattern => pattern.startsWith("*.") ? base.endsWith(pattern.slice(1)) : base === pattern))
        return false; return EXT.has(path.extname(relative).toLowerCase()); }
    async shareWorkspace() { const folder = vscode.workspace.workspaceFolders?.[0]; if (!folder)
        throw new Error("Open a workspace folder first."); const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"), "**/{node_modules,.git,dist,build,coverage,vendor}/**"); let count = 0; for (const uri of uris)
        if (await this.shareUri(uri))
            count++; return count; }
    async shareUri(uri) { if (uri.scheme !== "file")
        return false; const relative = this.relative(uri); if (!relative || !this.allowed(relative))
        return false; try {
        const document = await vscode.workspace.openTextDocument(uri);
        await this.shareDocument(document);
        return true;
    }
    catch {
        return false;
    } }
    async shareDocument(document) { if (document.isUntitled || document.uri.scheme !== "file")
        return; const relative = this.relative(document.uri); if (!relative || !this.allowed(relative))
        return; this.known.add(relative); const text = this.client.getDoc(relative).getText("content"); if (!text.length && document.getText())
        text.insert(0, document.getText());
    else if (text.toString() !== document.getText())
        await this.applyRemote(document.uri, text.toString()); }
    localChange(event) { if (event.document.isUntitled || event.document.uri.scheme !== "file")
        return; const relative = this.relative(event.document.uri); if (!relative || !this.allowed(relative) || this.applying.has(relative))
        return; const ytext = this.client.getDoc(relative).getText("content"); const before = ytext.toString(), after = event.document.getText(); if (before === after)
        return; let start = 0; while (start < before.length && start < after.length && before[start] === after[start])
        start++; let oldEnd = before.length, newEnd = after.length; while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
        oldEnd--;
        newEnd--;
    } ytext.doc?.transact(() => { if (oldEnd > start)
        ytext.delete(start, oldEnd - start); if (newEnd > start)
        ytext.insert(start, after.slice(start, newEnd)); }); this.known.add(relative); }
    async handleMessage(message) { if (message.type === "update") {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder || !this.allowed(message.path))
            return;
        const uri = vscode.Uri.joinPath(folder.uri, ...message.path.split("/"));
        await this.applyRemote(uri, this.client.getDoc(message.path).getText("content").toString());
    }
    else if (message.type === "file-op") {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder)
            return;
        const uri = vscode.Uri.joinPath(folder.uri, ...message.path.split("/"));
        if (message.operation === "delete") {
            try {
                await vscode.workspace.fs.delete(uri);
            }
            catch { }
        }
        else if (message.operation === "rename" && message.newPath) {
            const target = vscode.Uri.joinPath(folder.uri, ...message.newPath.split("/"));
            try {
                await vscode.workspace.fs.rename(uri, target, { overwrite: true });
            }
            catch { }
        }
    } }
    async applyRemote(uri, text) { const relative = this.relative(uri); if (!relative)
        return; try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    }
    catch { } let document; try {
        document = await vscode.workspace.openTextDocument(uri);
    }
    catch {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
        return;
    } if (document.getText() === text)
        return; this.applying.add(relative); try {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }
    finally {
        this.applying.delete(relative);
    } }
    publishPresence(editor = vscode.window.activeTextEditor) { if (!editor) {
        this.client.sendPresence("", 0, 0, false);
        return;
    } const relative = this.relative(editor.document.uri) ?? ""; const selection = editor.selection; const position = selection.active; this.client.sendPresence(relative, position.line, position.character, true, { startLine: selection.start.line, startColumn: selection.start.character, endLine: selection.end.line, endColumn: selection.end.character }); this.client.sendActiveFile(relative); }
    dispose() { for (const subscription of this.subscriptions)
        subscription.dispose(); }
}
exports.WorkspaceSync = WorkspaceSync;
