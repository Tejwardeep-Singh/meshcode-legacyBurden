MeshCode
Code together. Even when offline.

MeshCode is an offline-first collaboration extension for Visual Studio Code. It is designed to let developers collaborate over a local network without depending on an internet connection, while allowing each participant to continue working locally if the network becomes unavailable.
Project status: MeshCode is under active development. The current prototype focuses on LAN-hosted rooms, workspace sharing, and collaborative synchronization. Offline recovery, presence, and other capabilities should be treated as works in progress until verified in the current build.

Why MeshCode?
Most collaborative development tools assume a reliable internet connection. MeshCode explores a different approach:
- Use a local network for live collaboration.
- Continue editing files locally if the network drops.
- Preserve local changes so they can be synchronized after reconnection.
- Keep the workflow inside VS Code.
Important distinction: If internet access is unavailable but Wi-Fi/LAN remains connected, live collaboration can continue when devices can reach one another locally. If the local network itself is disconnected, live communication stops; each computer must continue locally and synchronize after connectivity returns.
Current prototype
- VS Code extension with an integrated meshcode terminal.
- LAN WebSocket room hosting and joining.
- LAN address discovery support, with manual IP joining as a fallback.
- Workspace file sharing with exclusion rules.
- LAN-first transport that does not require WAN access once participants can reach the host.
Check the current source and release notes before relying on a feature in a production workflow.
Planned / in-progress capabilities
- Durable local storage for edits made while disconnected.
- Reliable reconnection and missing-update exchange.
- Yjs-based collaborative document synchronization.
- Participant names, stable colors, and presence.
- Remote text cursors and selections.
- Active-file indicators and collaborator file presence.
- Physical mouse-pointer presence, subject to VS Code API limitations.
Requirements
- Visual Studio Code.
- Node.js and npm for development.
- A local network connection for live LAN collaboration.
- Firewall permission for the MeshCode host to accept connections on its configured port.
Development setup
1. Open or clone the MeshCode repository.
2. Install dependencies:
   npm install
3. Compile:
   npm run compile
4. Open the project folder in VS Code.
5. Press F5 to launch the Extension Development Host.
The exact scripts and supported VS Code version are defined in package.json.
Using the prototype
Open the MeshCode integrated terminal from the VS Code Command Palette, then use the commands supported by your current build.

Typical room workflow:
1. On the host computer, run meshcode create.
2. Share the host computer's reachable Wi-Fi/LAN IPv4 address and the room ID with participants.
3. On the host, run meshcode share to share eligible workspace files.
4. On another computer, run meshcode join <host-ip>:<port>.
5. Enter the room ID when prompted.
Example:
meshcode join 192.168.1.25:48765
Use the actual IP address and port printed by the host. Do not use 127.0.0.1 as the address for another computer; it refers to that computer itself.

Useful prototype commands:
meshcode help
meshcode create
meshcode share
meshcode status
meshcode join <host-ip>:<port>
Command availability may vary by build.
Network behaviour
Situation	Expected behaviour
Internet unavailable, Wi-Fi/LAN still connected	Live collaboration can continue if peers can reach one another locally.
Local network connection lost	Live communication stops. Participants can continue local work; later synchronization depends on the persistence and recovery features in the installed build.
Host computer or room process stops	The hosted room becomes unreachable until it is restarted or another supported host is available.


For two-computer testing, confirm both devices are connected to the same network. On the host, check its current Wi-Fi IPv4 address and ensure the configured port is allowed through the firewall.
Workspace sharing and safety
Only share a workspace with people you trust. Review the files being shared before starting a room. MeshCode should exclude sensitive files and generated folders by default where configured, but you are responsible for checking the current exclusion rules.

Never share credentials, private keys, access tokens, .env files, or other secrets. Do not treat LAN access as authentication or encryption unless the current release explicitly provides those protections.
Architecture (high level)
- VS Code extension: commands and editor integration.
- LAN discovery: helps participants find a room on the local network.
- WebSocket relay: forwards collaboration messages through the host.
- Yjs: intended CRDT foundation for merging concurrent document updates.
- Local persistence and recovery: intended to retain updates across disconnections.
The current LAN relay is a host-based design, not decentralized direct peer-to-peer networking. Direct WebRTC transport may be explored separately.
Contributing
Contributions, bug reports, and practical LAN test results are welcome.

When reporting a problem, include:
- MeshCode version.
- VS Code version and operating system.
- Whether internet was unavailable or the local network was disconnected.
- Steps to reproduce the issue.
- Relevant logs, with sensitive information redacted.
Roadmap
- [ ] Robust local update persistence.
- [ ] State-vector-based synchronization after reconnect.
- [ ] Reconnection and host-loss recovery.
- [ ] Participant identity and stable colors.
- [ ] Remote text cursors and selections.
- [ ] Active-file presence and file decorations.
- [ ] Evaluate a feasible physical mouse-pointer experience within VS Code API constraints.
- [ ] Automated tests and repeatable multi-computer LAN tests.
- [ ] Security review of room access and shared-file handling.
License
MeshCode is distributed under the MIT License. See LICENSE.