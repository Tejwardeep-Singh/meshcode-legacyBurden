"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PALETTE = void 0;
exports.isRecord = isRecord;
exports.validPath = validPath;
exports.validateClientMessage = validateClientMessage;
exports.PALETTE = ["#0072B2", "#009E73", "#CC79A7", "#D55E00", "#56B4E9", "#E69F00", "#7B61A8", "#008B8B", "#B33A3A", "#4F6D3A", "#A64D79", "#3F72AF"];
function isRecord(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function validPath(value) { return typeof value === "string" && value.length <= 1024 && !value.startsWith("/") && !value.split(/[\\/]/).includes(".."); }
function validateClientMessage(value) {
    if (!isRecord(value) || typeof value.type !== "string")
        return;
    const m = value;
    if (m.type === "hello" && typeof m.roomId === "string" && m.roomId.length <= 64 && typeof m.clientId === "string" && /^[\w-]{1,80}$/.test(m.clientId) && typeof m.name === "string" && m.name.trim().length > 0 && m.name.length <= 48)
        return m;
    if (m.type === "update" && validPath(m.path) && typeof m.update === "string" && m.update.length <= 12_000_000 && /^[A-Za-z0-9+/=]*$/.test(m.update))
        return m;
    if (m.type === "presence-update" && validPath(m.file) && finiteInt(m.line, 10_000_000) && finiteInt(m.column, 100_000) && validSelection(m.selection) && typeof m.active === "boolean" && typeof m.idle === "boolean")
        return m;
    if (m.type === "active-file-change" && (m.file === "" || validPath(m.file)))
        return m;
    if (m.type === "participant-idle" && typeof m.idle === "boolean")
        return m;
    if (m.type === "heartbeat")
        return m;
    if (m.type === "cursor-update" && validPath(m.file) && finiteInt(m.line, 10_000_000) && finiteInt(m.column, 100_000) && validSelection(m.selection))
        return m;
    if (m.type === "mouse-move" && validPath(m.file) && finite(m.x, 0, 1) && finite(m.y, 0, 1))
        return m;
    if (m.type === "mouse-leave" && (m.file === "" || validPath(m.file)))
        return m;
    if (m.type === "request-files")
        return m;
    if (m.type === "sync-request" && validPath(m.path) && typeof m.stateVector === "string" && m.stateVector.length <= 1_000_000)
        return m;
    if (m.type === "file-op" && (m.operation === "delete" || m.operation === "rename") && validPath(m.path) && (m.newPath === undefined || validPath(m.newPath)))
        return m;
}
function finite(v, min, max) { return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max; }
function finiteInt(v, max) { return finite(v, 0, max) && Number.isInteger(v); }
function validSelection(v) { return isRecord(v) && finiteInt(v.startLine, 10_000_000) && finiteInt(v.startColumn, 100_000) && finiteInt(v.endLine, 10_000_000) && finiteInt(v.endColumn, 100_000); }
