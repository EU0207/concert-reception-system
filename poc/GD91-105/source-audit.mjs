import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export function sourceHashes(root,entries){
 const seen=new Set(),visit=url=>{const file=fileURLToPath(url);if(seen.has(file)||file.includes('node_modules'))return;seen.add(file);if(!file.endsWith('.mjs'))return;const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))visit(new URL(match[1],url));};
 for(const entry of entries)visit(new URL(entry,root));
 return Object.fromEntries([...seen].sort().map(file=>[path.relative(fileURLToPath(root),file).replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
}
