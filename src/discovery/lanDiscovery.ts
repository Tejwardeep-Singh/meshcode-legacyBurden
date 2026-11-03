import * as dgram from "node:dgram";
import * as os from "node:os";
export interface DiscoveredRoom{roomId:string;host:string;port:number;name:string;}
const PORT=48766;
export function getLanIPv4Addresses():string[]{const a:string[]=[];for(const entries of Object.values(os.networkInterfaces()))for(const e of entries??[])if(e.family==="IPv4"&&!e.internal)a.push(e.address);return a;}
export class LanDiscovery{
 private socket?:dgram.Socket;private timer?:NodeJS.Timeout;
 async announce(room:DiscoveredRoom):Promise<void>{await this.stop();this.socket=dgram.createSocket("udp4");await new Promise<void>((res,rej)=>{this.socket!.once("error",rej);this.socket!.bind(0,()=>{this.socket!.setBroadcast(true);res();});});const send=()=>this.socket?.send(Buffer.from(JSON.stringify({...room,kind:"meshcode-room"})),PORT,"255.255.255.255");send();this.timer=setInterval(send,2500);}
 async discover(ms=3000):Promise<DiscoveredRoom[]>{const s=dgram.createSocket({type:"udp4",reuseAddr:true});const found=new Map<string,DiscoveredRoom>();await new Promise<void>((res,rej)=>{s.once("error",rej);s.bind(PORT,"0.0.0.0",()=>{s.on("message",(b,info)=>{try{const x=JSON.parse(b.toString());if(x.kind==="meshcode-room"){x.host=info.address;found.set(`${x.roomId}@${x.host}`,x);}}catch{}});setTimeout(()=>{s.close();res();},ms);});});return [...found.values()];}
 async stop():Promise<void>{if(this.timer)clearInterval(this.timer);this.timer=undefined;if(this.socket){const s=this.socket;this.socket=undefined;await new Promise<void>(r=>s.close(()=>r()));}}
}
