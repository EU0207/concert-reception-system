import assert from 'node:assert/strict';
import {request,base,data} from './transport.mjs';
const buffers=[];for await(const b of process.stdin)buffers.push(b);const {path,token}=JSON.parse(Buffer.concat(buffers).toString('utf8'));
assert(!path.includes('..')&&(path.startsWith('publicationShows/')||path.startsWith('sourceProofShows/')));
const r=await request(base+'/'+path,token);process.stdout.write(JSON.stringify({status:r.status,...(r.status===200?{data:data(r)}:{})}));
