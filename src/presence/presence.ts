import * as vscode from "vscode";
import {PeerInfo} from "../protocol";
export class PresenceManager implements vscode.Disposable{
 private types=new Map<string,vscode.TextEditorDecorationType>();
 update(peers:PeerInfo[]):void{for(const editor of vscode.window.visibleTextEditors){const file=editor.document.uri.fsPath.replace(/\\\\/g,"/");const used=new Set<string>();for(const p of peers){if(!p.active||!p.file)continue;const rel=p.file.replace(/\\\\/g,"/");if(!file.endsWith("/"+rel)&&!file.endsWith(rel))continue;const type=this.get(p.color);used.add(p.color);const line=Math.max(0,Math.min(p.line,editor.document.lineCount-1));editor.setDecorations(type,[{range:new vscode.Range(line,0,line,0),hoverMessage:new vscode.MarkdownString(`**${p.name}**\\n\\nEditing line ${line+1}`)}]);}for(const [color,type] of this.types)if(!used.has(color))editor.setDecorations(type,[]);}}
 private get(color:string):vscode.TextEditorDecorationType{let t=this.types.get(color);if(!t){t=vscode.window.createTextEditorDecorationType({before:{contentText:"●",color,margin:"0 8px 0 0"}});this.types.set(color,t);}return t;}
 dispose():void{for(const t of this.types.values())t.dispose();this.types.clear();}
}
