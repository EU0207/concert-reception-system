import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
export function certificate(){
 const cache=path.resolve('poc/POC-004/node_modules/.cache'),directory=path.join(cache,'gd120-tls-'+randomUUID());
 assert(path.resolve(directory).startsWith(cache+path.sep));fs.mkdirSync(directory,{recursive:true});
 const keyPath=path.join(directory,'key.pem'),certPath=path.join(directory,'cert.pem');
 execFileSync('git',['check-ignore','-q',keyPath],{stdio:'pipe',windowsHide:true});
 function remove(){for(const file of [keyPath,certPath]){assert.equal(path.dirname(path.resolve(file)),directory);if(fs.existsSync(file))fs.unlinkSync(file);}if(fs.existsSync(directory))fs.rmdirSync(directory);}
 try{
  execFileSync(process.env.CRS_OPENSSL_PATH??'C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore',windowsHide:true});
  return{key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath),certPath,remove};
 }catch(e){remove();throw e;}
}
