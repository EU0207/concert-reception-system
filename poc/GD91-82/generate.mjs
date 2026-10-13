import fs from 'node:fs';
// 現行認可の意味を最小のフラグへ縮約する。本人認証・セッション発行は対象外。
const at="root.child('checks').child($run)",device=at+".child('devices').child(auth.uid)";
const allowed="auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && "+device+".isString() && "+
  at+".child('roles').child("+device+".val()).val() === true && "+at+".child('sessions').child(auth.uid).val() === true && "+at+".child('control').val() === true";
const rules={rules:{'.read':false,'.write':false,checks:{$run:{events:{'.read':allowed,'.write':false,'.indexOn':['value']}}}}};
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.writeFileSync(new URL('deny.rules.json',import.meta.url),JSON.stringify({rules:{'.read':false,'.write':false}},null,2)+'\n');
console.log(JSON.stringify({permissionDependencies:4,clientWritesAllowed:false}));
