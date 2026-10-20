export const APP_VERSION = '0.1.0';
export class StartupError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'StartupError'; this.code = code; }
}
export interface AppConfig {
  schemaVersion: 1;
  appVersion: string;
  environmentId: string;
  environmentType: 'evaluation-local' | 'evaluation-firebase' | 'development' | 'production';
  environmentName: string;
  firebase?: { apiKey: string; authDomain: string; projectId: string; appId: string; databaseURL: string };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const validText = (v: unknown, max: number): v is string => typeof v === 'string'
  && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
export function parseConfig(value: unknown): AppConfig {
  if (!record(value) || value.schemaVersion !== 1 || value.appVersion !== APP_VERSION
    || typeof value.environmentId !== 'string' || !uuid.test(value.environmentId)
    || !validText(value.environmentName, 50)
    || !['evaluation-local', 'evaluation-firebase', 'development', 'production'].includes(String(value.environmentType))) {
    throw new StartupError('INVALID_CONFIG');
  }
  const fields = ['schemaVersion', 'appVersion', 'environmentId', 'environmentType', 'environmentName'];
  if (value.environmentType === 'evaluation-local') {
    if (Object.keys(value).some(k => !fields.includes(k))) throw new StartupError('INVALID_CONFIG');
  } else {
    fields.push('firebase');
    if (Object.keys(value).some(k => !fields.includes(k)) || !record(value.firebase)) throw new StartupError('INVALID_CONFIG');
    const firebase = value.firebase;
    const keys = ['apiKey', 'authDomain', 'projectId', 'appId', 'databaseURL'];
    if (Object.keys(firebase).length !== keys.length || !keys.every(k => validText(firebase[k], 300))) throw new StartupError('INVALID_CONFIG');
    let url: URL;
    try { url = new URL(String(firebase.databaseURL)); } catch { throw new StartupError('INVALID_CONFIG'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !/^[a-z\d-]+\.(?:firebaseio\.com|(?:[a-z\d-]+\.)?firebasedatabase\.app)$/.test(url.hostname)
      || url.pathname !== '/' || url.port) throw new StartupError('INVALID_CONFIG');
  }
  return structuredClone(value) as unknown as AppConfig;
}
// 配布アプリ版だけの更新では、同じ環境の結付きを変更しない。
export async function configFingerprint(config: AppConfig): Promise<string> {
  const f = config.firebase;
  const canonical = JSON.stringify([config.schemaVersion, config.environmentId, config.environmentType,
    config.environmentName, f ? [f.apiKey, f.authDomain, f.projectId, f.appId, f.databaseURL] : null]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
