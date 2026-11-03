export interface PeerInfo { clientId: string; name: string; color: string; file: string; line: number; column: number; active: boolean; }
export type ClientMessage =
 | { type: "hello"; roomId: string; clientId: string; name: string }
 | { type: "update"; path: string; update: string }
 | { type: "presence"; file: string; line: number; column: number; active: boolean }
 | { type: "request-files" }
 | { type: "sync-request"; path: string; stateVector: string }
 | { type: "file-op"; operation: "delete" | "rename"; path: string; newPath?: string };
export type ServerMessage =
 | { type: "welcome"; roomId: string; peers: PeerInfo[]; files: string[] }
 | { type: "update"; path: string; update: string; from: string }
 | { type: "presence"; peer: PeerInfo }
 | { type: "peer-left"; clientId: string }
 | { type: "file-list"; files: string[] }
 | { type: "file-op"; operation: "delete" | "rename"; path: string; newPath?: string }
 | { type: "error"; message: string };
export const PALETTE = ["#ec4899", "#22c55e", "#3b82f6", "#f59e0b", "#a78bfa", "#06b6d4"];
