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
exports.MeshTerminal = void 0;
const vscode = __importStar(require("vscode"));
class MeshTerminal {
    actions;
    output = new vscode.EventEmitter();
    closeEmitter = new vscode.EventEmitter();
    onDidWrite = this.output.event;
    onDidClose = this.closeEmitter.event;
    buffer = "";
    busy = false;
    constructor(actions) {
        this.actions = actions;
    }
    open() { this.write("MeshCode terminal - type 'meshcode help'\r\n\r\nmeshcode> "); }
    close() { this.output.dispose(); this.closeEmitter.dispose(); }
    handleInput(data) { for (const char of data) {
        if (char === "\u0003") {
            this.buffer = "";
            this.write("^C\r\nmeshcode> ");
            continue;
        }
        if (char === "\r" || char === "\n") {
            this.write("\r\n");
            if (this.busy) {
                this.write("Command still running. Please wait.\r\nmeshcode> ");
                continue;
            }
            const command = this.buffer.trim();
            this.buffer = "";
            if (command)
                void this.execute(command);
            else
                this.write("meshcode> ");
            continue;
        }
        if (char === "\u007f" || char === "\b") {
            if (this.buffer.length) {
                this.buffer = this.buffer.slice(0, -1);
                this.write("\b \b");
            }
            continue;
        }
        if (char >= " " && char !== "\u007f") {
            this.buffer += char;
            this.write(char);
        }
    } }
    async execute(input) { this.busy = true; try {
        const parts = input.split(/\s+/).filter(Boolean);
        if (parts[0]?.toLowerCase() === "meshcode")
            parts.shift();
        const command = parts[0]?.toLowerCase(), argument = parts[1];
        let result = "";
        switch (command) {
            case "help":
                result = ["meshcode create", "meshcode discover", "meshcode join <ip:port>", "meshcode status", "meshcode participants", "meshcode share", "meshcode leave"].join("\n");
                break;
            case "create":
                result = await this.actions.create();
                break;
            case "discover":
                result = await this.actions.discover();
                break;
            case "join":
                result = argument ? await this.actions.join(argument) : "Usage: meshcode join <ip:port>";
                break;
            case "status":
                result = this.actions.status();
                break;
            case "participants":
                result = this.actions.participants();
                break;
            case "share":
                result = await this.actions.share();
                break;
            case "leave":
                result = await this.actions.leave();
                break;
            case undefined: break;
            default: result = `Unknown command: ${command}. Type meshcode help.`;
        }
        if (result)
            this.write(result.replace(/\r?\n/g, "\r\n") + "\r\n");
    }
    catch (error) {
        this.write(`Error: ${String(error)}\r\n`);
    }
    finally {
        this.busy = false;
        this.write("meshcode> ");
    } }
    write(value) { this.output.fire(value); }
}
exports.MeshTerminal = MeshTerminal;
