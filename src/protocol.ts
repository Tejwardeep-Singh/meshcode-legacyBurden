export interface PeerInfo {
  clientId: string; name: string; color: string; file: string;
  line: number; column: number; selection: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  active: boolean; idle: boolean; lastActivity: number;
}
export type ClientMessage =
 | { type: "hello"; roomId: string; clientId: string; name: string }
 | { type: "update"; path: string; update: string }
 | { type: "presence-update"; file: string; line: number; column: number; selection: PeerInfo["selection"]; active: boolean; idle: boolean }
 | { type: "active-file-change"; file: string }
 | { type: "participant-idle"; idle: boolean }
 | { type: "heartbeat" }
 | { type: "cursor-update"; file: string; line: number; column: number; selection: PeerInfo["selection"] }
 | { type: "mouse-move"; file: string; x: number; y: number }
 | { type: "mouse-leave"; file: string }
 | { type: "request-files" }
 | { type: "sync-request"; path: string; stateVector: string }
 | { type: "file-op"; operation: "delete" | "rename"; path: string; newPath?: string };
export type ServerMessage =
 | { type: "welcome"; roomId: string; peers: PeerInfo[]; files: string[] }
 | { type: "update"; path: string; update: string; from: string }
 | { type: "participant-joined"; peer: PeerInfo }
 | { type: "participant-left"; clientId: string }
 | { type: "presence-update"; peer: PeerInfo }
 | { type: "cursor-update"; peer: PeerInfo }
 | { type: "active-file-change"; peer: PeerInfo }
 | { type: "participant-idle"; peer: PeerInfo }
 | { type: "mouse-move"; clientId: string; name: string; color: string; file: string; x: number; y: number }
 | { type: "mouse-leave"; clientId: string; file: string }
 | { type: "file-list"; files: string[] }
 | { type: "file-op"; operation: "delete" | "rename"; path: string; newPath?: string }
 | { type: "error"; message: string };
export const PALETTE = ["#0072B2", "#009E73", "#CC79A7", "#D55E00", "#56B4E9", "#E69F00", "#7B61A8", "#008B8B", "#B33A3A", "#4F6D3A", "#A64D79", "#3F72AF"];

export function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function validPath(value: unknown): value is string { return typeof value === "string" && value.length <= 1024 && !value.startsWith("/") && !value.split(/[\\/]/).includes(".."); }
export function validateClientMessage(value: unknown): ClientMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return;
  const m = value;
  if (m.type === "hello" && typeof m.roomId === "string" && m.roomId.length <= 64 && typeof m.clientId === "string" && /^[\w-]{1,80}$/.test(m.clientId) && typeof m.name === "string" && m.name.trim().length > 0 && m.name.length <= 48) return m as unknown as ClientMessage;
  if (m.type === "update" && validPath(m.path) && typeof m.update === "string" && m.update.length <= 12_000_000 && /^[A-Za-z0-9+/=]*$/.test(m.update)) return m as unknown as ClientMessage;
  if (m.type === "presence-update" && validPath(m.file) && finiteInt(m.line, 10_000_000) && finiteInt(m.column, 100_000) && validSelection(m.selection) && typeof m.active === "boolean" && typeof m.idle === "boolean") return m as unknown as ClientMessage;
  if (m.type === "active-file-change" && (m.file === "" || validPath(m.file))) return m as unknown as ClientMessage;
  if (m.type === "participant-idle" && typeof m.idle === "boolean") return m as unknown as ClientMessage;
  if (m.type === "heartbeat") return m as unknown as ClientMessage;
  if (m.type === "cursor-update" && validPath(m.file) && finiteInt(m.line, 10_000_000) && finiteInt(m.column, 100_000) && validSelection(m.selection)) return m as unknown as ClientMessage;
  if (m.type === "mouse-move" && validPath(m.file) && finite(m.x, 0, 1) && finite(m.y, 0, 1)) return m as unknown as ClientMessage;
  if (m.type === "mouse-leave" && (m.file === "" || validPath(m.file))) return m as unknown as ClientMessage;
  if (m.type === "request-files") return m as unknown as ClientMessage;
  if (m.type === "sync-request" && validPath(m.path) && typeof m.stateVector === "string" && m.stateVector.length <= 1_000_000) return m as unknown as ClientMessage;
  if (m.type === "file-op" && (m.operation === "delete" || m.operation === "rename") && validPath(m.path) && (m.newPath === undefined || validPath(m.newPath))) return m as unknown as ClientMessage;
}
function finite(v: unknown, min: number, max: number): v is number { return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max; }
function finiteInt(v: unknown, max: number): v is number { return finite(v, 0, max) && Number.isInteger(v); }
function validSelection(v: unknown): v is PeerInfo["selection"] { return isRecord(v) && finiteInt(v.startLine, 10_000_000) && finiteInt(v.startColumn, 100_000) && finiteInt(v.endLine, 10_000_000) && finiteInt(v.endColumn, 100_000); }
