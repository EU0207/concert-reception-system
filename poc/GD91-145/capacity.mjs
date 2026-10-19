import fs from 'node:fs';import assert from 'node:assert/strict';import './probe.mjs';
const original=new URL('../GD91-127/capacity.mjs',import.meta.url);
let code=fs.readFileSync(original,'utf8');
const anchor="const closingMeasurements=delta(closingStart,metrics)";
assert(code.includes(anchor));code=code.replace(anchor,"await globalThis.__gd145Migration({source:await owner(trial),sourceOwner:owner,sourceRequest:request,trial,manager:m});"+anchor);
const hook=`source=source.replace('const preparation=delta(start,metrics);','await globalThis.__gd145Images({m,user});const preparation=delta(start,metrics);');`;
const execute="await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));";assert(code.includes(execute));code=code.replace(execute,hook+'\n'+execute);
// 文字列中の置換パターンは保持し、式としてのimport.meta.urlだけを置き換える。
const literalNeedles=["'import.meta.url'",'"new URL(\'../GD91-100/database.rules.json\',import.meta.url)"','"new URL(\'artifacts/capacity-\'+people+\'-summary.json\',import.meta.url)"'];
for(const literal of literalNeedles){assert(code.includes(literal),'literal-adaptation-not-found');code=code.replaceAll(literal,literal.replace('import.meta.url','__gd145LiteralMeta__'));}
code=code.replaceAll('import.meta.url',JSON.stringify(original.href)).replaceAll('__gd145LiteralMeta__','import.meta.url');
code=code.replace("'artifacts/capacity-'",JSON.stringify(new URL('artifacts/source-capacity-',import.meta.url).href));
code=code.replace(/^import[^\r\n]*$/gm,line=>line.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href)));
globalThis.__gd121Routing={stats:()=>({emulatorHttpOnly:true,providerBillingMeasured:false})};
const cache=new URL('node_modules/.cache/',import.meta.url);fs.mkdirSync(cache,{recursive:true});const adapted=new URL('adapted-capacity.mjs',cache);fs.writeFileSync(adapted,code);
try{if(!process.argv.includes('--prepare'))await import(adapted.href);}
catch(e){console.error(JSON.stringify({wrapperFailure:true,code:e.code??e.name,message:e.message.slice(0,500)}));process.exitCode=1;}
