import fs from 'node:fs';import {receiptRules} from './receipt-rules.mjs';
const rules=JSON.parse(fs.readFileSync(new URL('../GD91-86/database.rules.json',import.meta.url),'utf8'));rules.rules.checks.$run.receipts=receiptRules();
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');fs.copyFileSync(new URL('../GD91-86/deny.rules.json',import.meta.url),new URL('deny.rules.json',import.meta.url));
console.log(JSON.stringify({generated:true,receiptStreamsAdded:true,externalFirebaseConnected:false}));
