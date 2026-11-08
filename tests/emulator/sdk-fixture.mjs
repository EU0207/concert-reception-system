// Authエミュレーター専用の架空Google資格。実Googleのログイン処理には使用しない。
import {
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { getDatabase, goOffline } from 'firebase/database';

export function disconnectFictionalDevice(principals) {
  if (principals.deviceAuth.emulatorConfig?.host !== '127.0.0.1') throw Error('EMULATOR_REQUIRED');
  goOffline(getDatabase(principals.deviceApp));
}

export async function reauthenticateFictionalGoogle(principals, identity) {
  if (
    principals.humanAuth.emulatorConfig?.host !== '127.0.0.1' ||
    !principals.humanApp.options.projectId.startsWith('demo-')
  )
    throw Error('EMULATOR_REQUIRED');
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ ...identity, email_verified: true }),
  );
  await reauthenticateWithCredential(principals.humanAuth.currentUser, credential);
}

export async function linkFictionalGoogle(principals, identity) {
  if (
    principals.humanAuth.emulatorConfig?.host !== '127.0.0.1' ||
    !principals.humanApp.options.projectId.startsWith('demo-')
  )
    throw Error('EMULATOR_REQUIRED');
  const user = principals.humanAuth.currentUser;
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ ...identity, email_verified: true }),
  );
  const linked = await linkWithCredential(user, credential);
  await reauthenticateWithCredential(linked.user, credential);
  return linked.user.uid;
}
