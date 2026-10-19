import fs from 'node:fs';
import net from 'node:net';
const read=fs.readFileSync;
fs.readFileSync=function(path,...args){
 if(String(path).includes('firebase-client-config.local.json')||String(path).includes('trial.local.json'))throw Error('private-config-read-before-approval');
 return read.call(this,path,...args);
};
globalThis.fetch=async()=>{throw Error('network-before-approval');};
net.Server.prototype.listen=function(){throw Error('login-server-before-approval');};
