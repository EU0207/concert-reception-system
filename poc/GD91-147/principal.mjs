import {base as R} from '../GD91-84/auth-rules.mjs';
const d=R+".child('devices').child(auth.uid)",s=R+".child('sessions').child(auth.uid)",v=(n,k)=>n+".child('"+k+"').val()",r=R+".child('roles').child("+v(d,'humanUid')+")";
// 主担当に限定した入口では、役割列挙と役割別provider分岐をowner/google.comへ展開する。
// 現在の役割・端末・セッションと15分以内の本人認証の条件は残す。
export const owner='('+[
 "auth != null","auth.token.firebase.sign_in_provider === 'anonymous'",v(d,'schemaVersion')+' === 2',v(s,'schemaVersion')+' === 2',v(d,'active')+' === true',v(d,'deviceUid')+' === auth.uid',v(d,'performanceId')+' === $run',v(s,'performanceId')+' === $run',v(s,'deviceUid')+' === auth.uid',v(s,'humanUid')+' === '+v(d,'humanUid'),v(s,'active')+' === true',v(s,'emailVerified')+' === true',v(s,'expiresAt')+' > now',v(r,'role')+" === 'owner'",v(r,'active')+' === true',r+".child('revision').isNumber()",v(r,'revision')+' > 0',v(r,'revision')+' % 1 === 0',r+".child('receptionBaselineRevision').isNumber()",v(r,'receptionBaselineRevision')+' >= 0',v(r,'receptionBaselineRevision')+' < '+v(r,'revision'),v(r,'startsAt')+' <= now','now < '+v(r,'endsAt'),v(s,'authProvider')+" === 'google.com'",v(d,'preparedRoleRevision')+' === '+v(r,'revision'),v(s,'roleRevision')+' === '+v(r,'revision'),v(s,'humanAuthTime')+' <= now','now <= '+v(s,'humanAuthTime')+' + 900000'
].join(' && ')+')';
