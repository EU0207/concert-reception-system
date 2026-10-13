// ADR-005の本人Authと端末Authを分ける。ローカル候補の式を生成する。
export const base="root.child('checks').child($run)";
const field=(node,name)=>`${node}.child('${name}').val()`;
const d=`${base}.child('devices').child(auth.uid)`,s=`${base}.child('sessions').child(auth.uid)`;
const r=`${base}.child('roles').child(${field(d,'humanUid')})`;
const managerRole=node=>`(${field(node,'role')} === 'owner' || ${field(node,'role')} === 'deputy')`;
const roleValid=node=>`${field(node,'active')} === true && (${['owner','deputy','temporary','receptionist'].map(role=>`${field(node,'role')} === '${role}'`).join(' || ')}) && ${node}.child('revision').isNumber() && ${field(node,'revision')} > 0 && ${field(node,'revision')} % 1 === 0 && ${node}.child('receptionBaselineRevision').isNumber() && ${field(node,'receptionBaselineRevision')} >= 0 && ${field(node,'receptionBaselineRevision')} < ${field(node,'revision')} && ${field(node,'startsAt')} <= now && now < ${field(node,'endsAt')}`;
const provider=(roleNode,providerExpr)=>`(${managerRole(roleNode)} ? ${providerExpr} === 'google.com' : ${providerExpr} === 'password')`;
const prepared=(device,session,role)=>`(${field(device,'preparedRoleRevision')} === ${field(role,'revision')} && ${field(session,'roleRevision')} === ${field(role,'revision')})`;
const baseline=(device,session,role)=>`(${field(role,'role')} === 'temporary' && ${field(role,'receptionBaselineRevision')} > 0 && ${field(device,'preparedRoleRevision')} === ${field(role,'receptionBaselineRevision')} && ${field(session,'roleRevision')} === ${field(role,'receptionBaselineRevision')})`;
const identity=`auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && ${field(d,'schemaVersion')} === 2 && ${field(s,'schemaVersion')} === 2 && ${field(d,'active')} === true && ${field(d,'deviceUid')} === auth.uid && ${field(d,'performanceId')} === $run && ${field(s,'performanceId')} === $run && ${field(s,'deviceUid')} === auth.uid && ${field(s,'humanUid')} === ${field(d,'humanUid')} && ${field(s,'active')} === true && ${field(s,'emailVerified')} === true && ${field(s,'expiresAt')} > now && ${roleValid(r)} && ${provider(r,field(s,'authProvider'))}`;
export const authorized=`(${identity} && (${prepared(d,s,r)} || ${baseline(d,s,r)}))`;
export const manager=`(${identity} && ${prepared(d,s,r)} && ${managerRole(r)})`;
export const recentManager=`(${manager} && ${field(s,'humanAuthTime')} <= now && now <= ${field(s,'humanAuthTime')} + 900000)`;
export const temporary=`(${identity} && ${prepared(d,s,r)} && ${field(r,'role')} === 'temporary')`;
export const activeRead=`(${authorized} && ${base}.child('control/state').val() === 'operating')`;
export const editing=`(${manager} && (${base}.child('control/state').val() === 'preparing' || ${base}.child('control/state').val() === 'operating' || ${base}.child('control/state').val() === 'stopped'))`;

export function accessRules(){
  const device=`${base}.child('devices').child($uid)`,role=`${base}.child('roles').child(auth.uid)`;
  const n='newData';
  const fields=['schemaVersion','performanceId','deviceUid','humanUid','active','emailVerified','authProvider','roleRevision','revision','issuedAt','expiresAt','humanAuthTime'];
  const shape=[`${n}.hasChildren(${JSON.stringify(fields)})`,`${field(n,'schemaVersion')} === 2`,`${field(n,'performanceId')} === $run`,`${field(n,'deviceUid')} === $uid`,`${field(n,'humanUid')} === auth.uid`,`${field(n,'emailVerified')} === true`,`${field(n,'revision')} === (data.exists() ? data.child('revision').val() + 1 : 1)`,`${field(n,'issuedAt')} === now`,`${field(n,'humanAuthTime')} === auth.token.auth_time * 1000`,`${field(n,'humanAuthTime')} <= now`,`${field(n,'expiresAt')} > now`,`${field(n,'expiresAt')} <= now + 43200000`,`${field(n,'expiresAt')} <= ${field(role,'endsAt')}`];
  const issue=`auth != null && auth.token.email_verified === true && ${roleValid(role)} && ${provider(role,'auth.token.firebase.sign_in_provider')} && ${field(device,'active')} === true && ${field(device,'humanUid')} === auth.uid && ${field(device,'deviceUid')} === $uid && ${field(device,'performanceId')} === $run && ${field(n,'active')} === true && (${prepared(device,n,role)} || ${baseline(device,n,role)}) && ${field(n,'authProvider')} === auth.token.firebase.sign_in_provider && ${shape.join(' && ')}`;
  const same=fields.filter(x=>!['active','revision'].includes(x)).map(x=>`${field(n,x)} === ${field('data',x)}`).join(' && ');
  const revoke=`auth != null && (auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password') && data.child('humanUid').val() === auth.uid && ${field(n,'active')} === false && ${field(n,'revision')} === data.child('revision').val() + 1 && ${same}`;
  return {roles:{$human:{'.read':`auth != null && auth.uid === $human`,'.write':false}},
    devices:{$uid:{'.read':`auth != null && auth.uid === $uid`,'.write':false}},
    sessions:{$uid:{'.read':`auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'`,
      '.write':`newData.exists() && ((${issue}) || (${revoke}))`,
      ...Object.fromEntries(fields.map(k=>[k,{'.validate':true}])), '$other':{'.validate':false}}},
    control:{'.read':authorized,'.write':false}};
}
