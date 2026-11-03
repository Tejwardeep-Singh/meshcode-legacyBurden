import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as os from "node:os";
import {LanRoomServer} from "./collaboration/lanServer";
import {LanRoomClient} from "./collaboration/lanClient";
import {LanDiscovery,getLanIPv4Addresses,DiscoveredRoom} from "./discovery/lanDiscovery";
import {WorkspaceSync} from "./sync/workspaceSync";
import {PresenceManager} from "./presence/presence";
import {MeshTerminal} from "./terminal/meshTerminal";
import {PeerInfo} from "./protocol";
import {CollaboratorFileDecorations} from "./presence/presence";
import {UpdateStore} from "./persistence/updateStore";
let server:LanRoomServer|undefined,client:LanRoomClient|undefined,syncer:WorkspaceSync|undefined,discovery:LanDiscovery|undefined,presence:PresenceManager|undefined,fileDecorations:CollaboratorFileDecorations|undefined;
let output:vscode.OutputChannel,status:vscode.StatusBarItem,roomId="",roomAddress="",peers:PeerInfo[]=[],terminal:vscode.Terminal|undefined,store:UpdateStore;
let cursorTimer:NodeJS.Timeout|undefined,cursorPending:(()=>void)|undefined;
let heartbeatTimer:NodeJS.Timeout|undefined,idleTimer:NodeJS.Timeout|undefined;
function cursorThrottle(action:()=>void):void{cursorPending=action;if(cursorTimer)return;cursorTimer=setTimeout(()=>{cursorTimer=undefined;cursorPending?.();cursorPending=undefined;},34);}
function noteActivity():void{if(idleTimer)clearTimeout(idleTimer);client?.sendIdle(false);idleTimer=setTimeout(()=>client?.sendIdle(true),60_000);}
function log(s:string):void{output.appendLine(`[${new Date().toLocaleTimeString()}] ${s}`);}
async function askName(context:vscode.ExtensionContext,title:string):Promise<string|undefined>{const preferred=context.globalState.get<string>("preferredDisplayName")||vscode.workspace.getConfiguration("meshcode").get<string>("displayName","Developer");const value=await vscode.window.showInputBox({title,prompt:"Name shown to everyone in this room",value:preferred,ignoreFocusOut:true,validateInput:v=>v.trim()?undefined:"Display name cannot be empty."});if(value?.trim())await context.globalState.update("preferredDisplayName",value.trim());return value?.trim();}
function statusUpdate():void{status.text=client?`$(radio-tower) MeshCode: ${peers.length} peers`:server?"$(broadcast) MeshCode: Hosting":"$(circle-outline) MeshCode: Offline";status.tooltip=client?`Room ${roomId} · ${roomAddress}`:"No active session";status.show();}
async function leave(stopHost=true):Promise<string>{if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=undefined;if(idleTimer)clearTimeout(idleTimer);idleTimer=undefined;client?.sendPresence("",0,0,false);syncer?.dispose();syncer=undefined;presence?.dispose();presence=undefined;client?.close();client=undefined;peers=[];fileDecorations?.refresh();if(stopHost&&discovery){await discovery.stop();discovery=undefined;}if(stopHost&&server){await server.stop();server=undefined;}statusUpdate();return "Left MeshCode session.";}
async function join(address:string,id:string,name:string):Promise<string>{await leave(false);if(!name.trim())throw new Error("Display name cannot be empty.");client=new LanRoomClient(address,id,crypto.randomUUID(),name.trim(),store);await client.connect();heartbeatTimer=setInterval(()=>client?.heartbeat(),20_000);noteActivity();roomId=id;roomAddress=address;syncer=new WorkspaceSync(client,output);presence=new PresenceManager();client.onMessage(m=>{if(m.type==="welcome")peers=m.peers.filter(p=>p.clientId!==client?.clientId);else if("peer" in m)peers=[...peers.filter(p=>p.clientId!==m.peer.clientId),m.peer];else if(m.type==="participant-left")peers=peers.filter(p=>p.clientId!==m.clientId);presence?.update(peers);fileDecorations?.refresh();});
 client.onConnectionChanged=connected=>{log(connected?"LAN connection restored; synchronizing local updates":"LAN connection lost; local editing and persistence remain available");if(connected&&syncer)syncer.publishPresence();statusUpdate();};client.onClosed=()=>{log("LAN connection closed");statusUpdate();};peers=client.peers.filter(p=>p.clientId!==client!.clientId);statusUpdate();return `Joined ${id} at ${address}. WAN internet is not needed while this LAN path remains available.`;}
export function activate(context:vscode.ExtensionContext):void{
 output=vscode.window.createOutputChannel("MeshCode");store=new UpdateStore(context.globalStorageUri.fsPath);status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);fileDecorations=new CollaboratorFileDecorations(()=>peers);context.subscriptions.push(output,status,fileDecorations,vscode.window.registerFileDecorationProvider(fileDecorations));statusUpdate();
 const openTerminal=()=>{const pty=new MeshTerminal({
  create:async()=>{if(server)return `Already hosting ${roomId}`;const name=await askName(context,"Create MeshCode room");if(!name)return "Room creation cancelled.";const roomName=(await vscode.window.showInputBox({prompt:"Optional room name",placeHolder:"My team session"}))?.trim()||"MeshCode";const port=vscode.workspace.getConfiguration("meshcode").get<number>("port",48765);roomId=crypto.randomBytes(3).toString("hex").toUpperCase();server=new LanRoomServer(roomId,port,log);await server.start();discovery=new LanDiscovery();await discovery.announce({roomId,host:"",port,name:roomName});const ips=getLanIPv4Addresses();roomAddress=`${ips[0]??"localhost"}:${port}`;await join(`127.0.0.1:${port}`,roomId,name);return `Hosting room ${roomId} (${roomName})\\nShare one of these LAN addresses:\\n${ips.map(ip=>`  ${ip}:${port}`).join("\\n")}\\nKeep this VS Code window open.`;},
  discover:async()=>{const d=new LanDiscovery();const rooms:DiscoveredRoom[]=await d.discover();await d.stop();return rooms.length?rooms.map(r=>`${r.roomId}  ${r.host}:${r.port}  ${r.name}`).join("\\n"):"No rooms found. Check same Wi-Fi, firewall, and client isolation. Direct join is available.";},
  join:async(address)=>{const name=await askName(context,"Join MeshCode room");if(!name)return "Join cancelled.";const host=address.includes(":")?address:`${address}:48765`;const id=await vscode.window.showInputBox({prompt:"Enter room ID shown by host"});return id?join(host,id.trim().toUpperCase(),name):"Join cancelled.";},
  status:()=>client?`Room: ${roomId}\\nAddress: ${roomAddress}\\nPeers: ${peers.length}\\nTransport: LAN WebSocket relay\\nWAN dependency after joining: none`:server?`Hosting ${roomId}`:"No active room.",
  participants:()=>peers.length?peers.map(p=>`${p.color} ${p.name}${p.active?` — ${p.file}:${p.line+1}`:""}${p.idle?" (idle)":""}`).join("\\n"):"No other participants reported yet.",
  share:async()=>{if(!syncer)return "Create or join a room first.";const n=await syncer.shareWorkspace();return `Shared ${n} eligible text files (exclusions applied).`;},
  leave:async()=>leave()
 });terminal=vscode.window.createTerminal({name:"MeshCode",pty});terminal.show();};
 context.subscriptions.push(
  vscode.commands.registerCommand("meshcode.openTerminal",openTerminal),
  vscode.commands.registerCommand("meshcode.createRoom",()=>{openTerminal();vscode.window.showInformationMessage("Run `meshcode create` in the MeshCode terminal.");}),
  vscode.commands.registerCommand("meshcode.discoverRooms",async()=>{const d=new LanDiscovery();const rooms=await d.discover();await d.stop();const selected=await vscode.window.showQuickPick(rooms.map(r=>({label:`${r.roomId} — ${r.name}`,description:`${r.host}:${r.port}`,room:r})));if(selected)vscode.window.showInformationMessage(`In MeshCode terminal run: meshcode join ${selected.room.host}:${selected.room.port} (room ${selected.room.roomId})`);}),
  vscode.commands.registerCommand("meshcode.showStatus",()=>vscode.window.showInformationMessage(client?`Room ${roomId} · ${peers.length} peers · LAN`:"MeshCode is not connected.")),
  vscode.commands.registerCommand("meshcode.leaveRoom",async()=>vscode.window.showInformationMessage(await leave())),
  vscode.window.onDidChangeTextEditorSelection(e=>{if(client){noteActivity();const e0=e.textEditor,sel=e0.selection,rel=syncer?.relativePath(e0.document.uri);if(rel){cursorThrottle(()=>{syncer?.publishPresence(e0);client?.sendCursor(rel,sel.active.line,sel.active.character,{startLine:sel.start.line,startColumn:sel.start.character,endLine:sel.end.line,endColumn:sel.end.character});presence?.update(peers);});}}}),
  vscode.window.onDidChangeActiveTextEditor(e=>{if(client){const file=e?syncer?.relativePath(e.document.uri)??"":"";client.sendActiveFile(file);if(!file)client.sendPresence("",0,0,false);else syncer?.publishPresence(e);presence?.update(peers);}})
 );
 fileDecorations.refresh();
 log("MeshCode activated. Run MeshCode: Open Terminal.");
}
export function deactivate():void{if(cursorTimer)clearTimeout(cursorTimer);void leave();}
