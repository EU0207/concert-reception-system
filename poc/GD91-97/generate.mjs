import fs from 'node:fs';
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});for(const f of['database.rules.json','deny.rules.json','firebase.json'])fs.copyFileSync(new URL('../GD91-96/'+f,import.meta.url),new URL(f,import.meta.url));console.log(JSON.stringify({sameRulesAs:'GD91-96',externalFirebaseConnected:false}));
