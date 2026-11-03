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
exports.UpdateStore = void 0;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const Y = __importStar(require("yjs"));
/** Append-only local Yjs update store. Updates are persisted before network delivery. */
class UpdateStore {
    root;
    constructor(root) {
        this.root = root;
    }
    fileFor(docPath) {
        const safe = Buffer.from(docPath.replace(/\\/g, "/")).toString("base64url");
        return path.join(this.root, `${safe}.updates`);
    }
    async append(docPath, update) {
        await fs.mkdir(this.root, { recursive: true });
        await fs.appendFile(this.fileFor(docPath), Buffer.from(update).toString("base64") + "\n", "utf8");
    }
    async restore(docPath, doc) {
        try {
            const data = await fs.readFile(this.fileFor(docPath), "utf8");
            for (const line of data.split("\n"))
                if (line)
                    Y.applyUpdate(doc, Buffer.from(line, "base64"), "persistence");
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
    }
    async paths() {
        try {
            const files = await fs.readdir(this.root);
            return files.filter(f => f.endsWith(".updates")).map(f => Buffer.from(f.slice(0, -8), "base64url").toString("utf8"));
        }
        catch {
            return [];
        }
    }
}
exports.UpdateStore = UpdateStore;
