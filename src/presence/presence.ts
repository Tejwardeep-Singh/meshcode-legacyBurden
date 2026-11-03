import * as vscode from "vscode";
import { PeerInfo } from "../protocol";
import * as path from "node:path";

export class PresenceManager implements vscode.Disposable {
  private types = new Map<string, vscode.TextEditorDecorationType>();
  update(peers: PeerInfo[]): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const relative = this.relative(editor.document.uri); const relevant = peers.filter(p => p.active && !p.idle && p.file === relative);
      const active = new Set<string>();
      for (const peer of relevant) {
        if (!Number.isInteger(peer.line) || peer.line < 0 || peer.line >= editor.document.lineCount || peer.column < 0 || peer.column > editor.document.lineAt(peer.line).text.length || peer.selection.startLine >= editor.document.lineCount || peer.selection.endLine >= editor.document.lineCount) continue;
        active.add(peer.clientId); const type = this.get(peer);
        const pos = new vscode.Position(Math.min(peer.line, editor.document.lineCount - 1), Math.min(peer.column, editor.document.lineAt(Math.min(peer.line, editor.document.lineCount - 1)).text.length));
        const s = peer.selection; const startLine = Math.min(s.startLine, editor.document.lineCount - 1), endLine = Math.min(s.endLine, editor.document.lineCount - 1);
        const start = new vscode.Position(startLine, Math.min(s.startColumn, editor.document.lineAt(startLine).text.length));
        const end = new vscode.Position(endLine, Math.min(s.endColumn, editor.document.lineAt(endLine).text.length));
        const decorations: vscode.DecorationOptions[] = [{ range: new vscode.Range(pos, pos), hoverMessage: new vscode.MarkdownString(`**${peer.name}** · ${peer.idle ? "Idle" : "Editing"}`), renderOptions: { after: { contentText: ` ${peer.name} `, color: contrastText(peer.color), backgroundColor: peer.color, margin: "0 0 0 4px", border: "1px solid", borderColor: peer.color } } }];
        if (!start.isEqual(end)) decorations.push({ range: new vscode.Range(start, end), hoverMessage: new vscode.MarkdownString(`**${peer.name}** selected this text`) });
        editor.setDecorations(type, decorations);
      }
      for (const [id, type] of this.types) if (!active.has(id)) editor.setDecorations(type, []);
    }
  }
  private relative(uri: vscode.Uri): string { const folder = vscode.workspace.getWorkspaceFolder(uri); return folder ? path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/") : ""; }
  private get(peer: PeerInfo): vscode.TextEditorDecorationType {
    let type = this.types.get(peer.clientId);
    if (!type) { type = vscode.window.createTextEditorDecorationType({ borderStyle: "solid", borderWidth: "0 0 0 2px", borderColor: peer.color, backgroundColor: new vscode.ThemeColor("editor.selectionBackground"), before: { contentText: "▏", color: peer.color, margin: "0 1px 0 0" }, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed }); this.types.set(peer.clientId, type); }
    return type;
  }
  dispose(): void { for (const type of this.types.values()) type.dispose(); this.types.clear(); }
}

function contrastText(hex: string): string { const c = hex.replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(c)) return "#ffffff"; const channels = [0, 2, 4].map(i => { const n = parseInt(c.slice(i, i + 2), 16) / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.35 ? "#111111" : "#ffffff"; }

export class CollaboratorFileDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>(); readonly onDidChangeFileDecorations = this.emitter.event;
  private previouslyNotified = new Map<string, vscode.Uri>();
  constructor(private readonly getPeers: () => PeerInfo[]) {}
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri); if (!folder) return;
    const rel = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
    const peers = this.getPeers().filter(p => p.active && p.file === rel); if (!peers.length) return;
    const names = peers.map(p => `${p.name} (${p.color})`).join(", "); return new vscode.FileDecoration(String(Math.min(peers.length, 9)), `${peers.length} collaborator${peers.length === 1 ? "" : "s"}: ${names}`, new vscode.ThemeColor("charts.blue"));
  }
  refresh(): void { const current = new Map<string, vscode.Uri>(); const folders = vscode.workspace.workspaceFolders ?? []; for (const folder of folders) for (const peer of this.getPeers()) if (peer.file) { const uri = vscode.Uri.joinPath(folder.uri, ...peer.file.split("/")); current.set(uri.toString(), uri); } this.emitter.fire([...new Map([...this.previouslyNotified, ...current]).values()]); this.previouslyNotified = current; }
  dispose(): void { this.previouslyNotified.clear(); this.emitter.dispose(); }
}
