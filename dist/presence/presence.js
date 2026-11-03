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
exports.PresenceManager = void 0;
const vscode = __importStar(require("vscode"));
class PresenceManager {
    types = new Map();
    update(peers) { for (const editor of vscode.window.visibleTextEditors) {
        const file = editor.document.uri.fsPath.replace(/\\\\/g, "/");
        const used = new Set();
        for (const p of peers) {
            if (!p.active || !p.file)
                continue;
            const rel = p.file.replace(/\\\\/g, "/");
            if (!file.endsWith("/" + rel) && !file.endsWith(rel))
                continue;
            const type = this.get(p.color);
            used.add(p.color);
            const line = Math.max(0, Math.min(p.line, editor.document.lineCount - 1));
            editor.setDecorations(type, [{ range: new vscode.Range(line, 0, line, 0), hoverMessage: new vscode.MarkdownString(`**${p.name}**\\n\\nEditing line ${line + 1}`) }]);
        }
        for (const [color, type] of this.types)
            if (!used.has(color))
                editor.setDecorations(type, []);
    } }
    get(color) { let t = this.types.get(color); if (!t) {
        t = vscode.window.createTextEditorDecorationType({ before: { contentText: "●", color, margin: "0 8px 0 0" } });
        this.types.set(color, t);
    } return t; }
    dispose() { for (const t of this.types.values())
        t.dispose(); this.types.clear(); }
}
exports.PresenceManager = PresenceManager;
