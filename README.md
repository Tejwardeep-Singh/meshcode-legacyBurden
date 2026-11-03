# MeshCode 0.2.0

Offline-first LAN collaboration for Visual Studio Code. MeshCode uses Yjs CRDT documents, a participant-hosted LAN WebSocket relay, local append-only update persistence, workspace file synchronization, and automatic reconnect attempts. No cloud service or WAN internet is required for an established same-LAN session.

## Requirements
- VS Code 1.90+
- Node.js 18+ for development/build
- Computers able to reach one another over the same LAN; allow the configured TCP port (default 48765) through the host firewall.

## Build and run
```bash
npm install
npm run compile
```
Open this folder in VS Code and press F5. In the Extension Development Host, open a workspace folder and run `MeshCode: Open Terminal`.

Commands: `meshcode create`, `meshcode discover`, `meshcode join <ip:port>`, `meshcode status`, `meshcode participants`, `meshcode share`, `meshcode leave`.

## Package for another computer
```bash
npm install
npm run compile
npx vsce package
```
Install the generated `.vsix` on each participant using Extensions > `...` > Install from VSIX. Do not copy `node_modules` or the source folder to participants.

## Offline-first behaviour
- Text edits update local Yjs documents.
- Yjs updates are appended to VS Code extension global storage and restored when a document is opened again.
- When the LAN connection drops, the client retries with exponential backoff; local file editing remains available.
- On reconnection, the client sends its local Yjs state to the room and the room relays updates.
- Yjs merges concurrent updates deterministically.

## Important MVP limitations
This is a LAN-relay architecture, not a direct WebRTC mesh. The room host is a single point of relay; if the host goes offline, participants can continue editing locally but cannot exchange updates until the host returns. UDP discovery is best-effort and manual IP joining is the fallback. The append-only update log is intentionally simple and can grow over time; production use needs compaction, retention controls, and corruption recovery. File create/delete/rename events are relayed as basic operations; complex simultaneous filesystem operations and binary files are not fully reconciled. VS Code tab-label color dots are not exposed as a general stable extension API; presence is represented through editor decorations/status UI.

## Security
MeshCode is intended for trusted private LANs. The current MVP does not provide room passwords, transport encryption, or per-file authorization. Do not share sensitive workspaces on untrusted networks. Excluded folders/files are configurable in VS Code settings.

## Test checklist
1. Create a room on one computer and share a workspace containing text files.
2. Join from a second computer on the same LAN using the host's actual Wi-Fi IPv4 address.
3. Edit the same text file from both computers and verify the merged result.
4. Disconnect one participant's Wi-Fi, edit locally, reconnect, and verify updates converge.
5. Restart the extension host offline and verify the local workspace remains intact.
6. Test host loss separately: peers should retain local work but cannot sync until host returns.
