import fs from 'node:fs';import assert from 'node:assert/strict';import {namespace,environment} from './rules.mjs';import './correction.mjs';import './late-source.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const original=new URL('../GD91-146/probe.mjs',import.meta.url),root=new URL('./',import.meta.url),files=['probe.mjs','rules.mjs','bundle.mjs','codec.mjs','browser.mjs','index.html','correction.mjs','late-source.mjs','normalization-test.mjs','lineage-probe.mjs','../GD91-146/rules.mjs','../GD91-147/rules.mjs','../GD91-147/principal.mjs','preflight.mjs','micro.mjs','capacity.mjs','run-local.mjs','firebase.json','database.rules.json','../GD91-146/probe.mjs'];
const before=sourceHashes(root,files);let code=fs.readFileSync(original,'utf8');
function replace(from,to){assert(code.includes(from),'adaptation-not-found:'+from.slice(0,70));code=code.replace(from,to);}
replace("from './rules.mjs'",'from '+JSON.stringify(new URL('./rules.mjs',root).href));
replace("from '../GD91-145/bundle.mjs'",'from '+JSON.stringify(new URL('./bundle.mjs',root).href));
code=code.replaceAll('poc/GD91-146/index.html','poc/GD91-148/index.html');
replace('I01-browser-plan', 'I01-browser-plan');
replace("  phase='cleanup';","  await globalThis.__gd148Correct({call,m,bundle});phase='cleanup';");
replace("namespace='demo-concert-seat-gd91-84-import-rules'",'namespace='+JSON.stringify(namespace));
replace("const u=new URL('http://127.0.0.1:9000/'+p+'.json');","const wire=p.startsWith('checks/')?'environments/'+"+JSON.stringify(environment)+"+'/performances/'+p.slice(7):p;const u=new URL('http://127.0.0.1:9000/'+wire+'.json');");
replace('rules.rules.checks.$run','rules.rules.environments.$env.performances.$run');
const inject=`await context.addInitScript(({namespace,environment})=>{const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const u=new URL(input instanceof Request?input.url:String(input),location.href);if(u.hostname==='127.0.0.1'&&u.port==='9000'&&u.searchParams.get('ns')==='demo-concert-seat-gd91-84-import-rules'){if(u.pathname.startsWith('/checks/'))u.pathname='/environments/'+environment+'/performances/'+u.pathname.slice(8);u.searchParams.set('ns',namespace);return originalFetch(u.href,options);}return originalFetch(input,options);};},{namespace:${JSON.stringify(namespace)},environment:${JSON.stringify(environment)}});`;
replace('page=await context.newPage();',inject+'page=await context.newPage();');
replace("new URL('artifacts/local-summary.json',root)",'new URL('+JSON.stringify(new URL('artifacts/local-summary.json',root).href)+')');
code=code.replace(/^import[^\r\n]*$/gm,line=>line.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href))).replaceAll('import.meta.url',JSON.stringify(original.href));
const cache=new URL('node_modules/.cache/',root);fs.mkdirSync(cache,{recursive:true});const adapted=new URL('adapted-probe.mjs',cache);fs.writeFileSync(adapted,code);await import(adapted.href);
const execute=globalThis.__gd146Migration;assert.equal(typeof execute,'function');
globalThis.__gd146Migration=async args=>{try{return await execute(args);}finally{const file=new URL('artifacts/local-summary.json',root),r=JSON.parse(fs.readFileSync(file));assert.deepEqual(before,sourceHashes(root,files));r.formalPathSourceHashes=before;r.formalPathEndSourceHashes=before;r.formalPath={targetNamespace:namespace,targetPathShape:'environments/{environment}/performances/{performance}',testHarnessMapsOldFacadeToFormalWirePaths:true,productionFrontendIntegrated:false,ownerOnlyAuthorizationSpecialized:true,micro:globalThis.__gd148Micro,postImportCorrection:globalThis.__gd148Correction,lateSource:globalThis.__gd148Late};fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');}};
