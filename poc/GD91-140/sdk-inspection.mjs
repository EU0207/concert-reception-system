import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),sdkRequire=createRequire(require.resolve('firebase/firestore')),entry=sdkRequire.resolve('@firebase/firestore'),dir=path.dirname(entry);
const commonFile=fs.readdirSync(dir).find(f=>f.startsWith('common-')&&f.endsWith('.node.cjs.js'));assert(commonFile);
const entrySource=fs.readFileSync(entry,'utf8'),commonSource=fs.readFileSync(path.join(dir,commonFile),'utf8');
const delegate=entrySource.match(/function getDocFromServer\(reference\) \{[\s\S]*?\n\}/)?.[0];assert(delegate?.includes('firestoreClientGetDocumentViaSnapshotListener'));assert(commonSource.includes('return new GrpcConnection(protos, databaseInfo);'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const browserSource=fs.readFileSync(new URL('.vite/deps/firebase_firestore.js',import.meta.url),'utf8');assert(browserSource.includes('return new __PRIVATE_WebChannelConnection(e);'));assert(browserSource.includes('.createWebChannel('));
const result={firebaseVersion:require('firebase/package.json').version,resolvedNodeEntry:path.basename(entry),entrySha256:hash(entrySource),commonFile,commonSha256:hash(commonSource),getDocFromServerUsesSnapshotListener:true,nodeConnectionFactoryUsesGrpc:true,
 browserBundleSha256:hash(browserSource),browserConnectionFactoryUsesWebChannel:true,browserUsesSameTransportVerified:false,underlyingCauseConfirmed:false};
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/sdk-inspection.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
