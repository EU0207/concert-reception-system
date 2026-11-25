// 本人認証の入力・確認画面を組み立てる。公演の業務認可や端末準備の代わりにはしない。

import { button, el } from './dom.ts';
import type { HumanIdentity } from '../domain/authorization/types.ts';

export interface AuthenticationUiPort {
  identity(): Promise<HumanIdentity | null>;
  google(): Promise<void>;
  password(email: string, password: string): Promise<void>;
  verification(): Promise<void>;
  refresh(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  reauthenticate(password?: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(listener: () => void): () => void;
}

/** 資格情報を表示・保存せず、利用者が対処できる認証エラーだけを返す。 */
function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code)) return 'ログインをキャンセルしました。';
  if (code === 'auth/popup-blocked') return 'ポップアップを許可して、もう一度お試しください。';
  if (code === 'auth/network-request-failed') return '接続を確認して、もう一度お試しください。';
  if (code === 'auth/too-many-requests') return 'しばらく待ってから、もう一度お試しください。';
  return '本人確認ができませんでした。入力内容や接続を確認して、もう一度お試しください。';
}

/** 承認済みのパスワード条件で、不足しているものだけを返す。 */
function passwordError(value: string): string {
  const missing: string[] = [];
  if (value.length < 6 || value.length > 20) missing.push('6～20文字にしてください');
  if (!/[A-Za-z]/.test(value)) missing.push('半角英字を含めてください');
  if (!/[0-9]/.test(value)) missing.push('数字を含めてください');
  return missing.join('。');
}

/** 認証操作の重複と古い応答を防ぎ、入力画面と本人確認状態を表示する。 */
export function createAuthenticationScreen(port: AuthenticationUiPort, preview = false) {
  const root = el('section', 'panel authentication-screen');
  let identity: HumanIdentity | null = null, initialized = false, busy = false, disposed = false, version = 0;
  let email = '', password = '', reauth = false, error = '', notice = '';

  /** メールとパスワードをDOMの値として入力し、HTML属性や保存先へ書き出さない。 */
  function field(label: string, type: string, value: string, update: (value: string) => void) {
    const wrapper = el('label', 'seat-field', label), input = el('input');
    input.type = type;
    input.value = value;
    input.disabled = busy;
    input.autocomplete = type === 'password' ? 'current-password' : 'username';
    input.maxLength = type === 'password' ? 20 : 254;
    input.addEventListener('input', () => update(input.value));
    wrapper.append(input);
    return wrapper;
  }

  /** 入力条件の不足だけを表示し、利用者の入力値をメッセージへ含めない。 */
  function validate(needsPassword: boolean): boolean {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) error = 'メールアドレスの形式を確認してください。';
    else if (needsPassword && passwordError(password)) error = `パスワード：${passwordError(password)}。`;
    else return true;
    render();
    return false;
  }

  /** 処理中は操作を止め、完了後の現在の本人だけを表示する。 */
  async function act(action: () => Promise<void>, success = '') {
    if (busy || disposed) return;
    const current = ++version;
    busy = true; error = notice = ''; password = '';
    render();
    try {
      await action();
      const result = await port.identity();
      if (disposed || current !== version) return;
      identity = result;
      notice = success;
      reauth = false;
    } catch (cause) {
      if (!disposed && current === version) error = errorMessage(cause);
    } finally {
      if (!disposed && current === version) { busy = false; render(); }
    }
  }

  /** 本人認証の状態だけを復元し、未確認でも業務画面を開かない。 */
  async function refreshState() {
    if (busy || disposed) return;
    const current = ++version;
    try {
      const result = await port.identity();
      if (!disposed && current === version) { identity = result; initialized = true; reauth = false; render(); }
    } catch {
      if (!disposed && current === version) { initialized = true; error = '本人の状態を確認できません。接続を確認して、もう一度お試しください。'; render(); }
    }
  }

  /** 状態に応じて認証・メール確認・再認証のフォームを表示する。 */
  function render() {
    if (disposed) return;
    root.setAttribute('aria-busy', String(busy || !initialized));
    root.replaceChildren(el('h2', '', 'ログインと本人確認'));
    if (preview) root.append(el('p', 'notice', '画面確認用の見本です。実際のGoogleログインやメール送信は行いません。'));
    const alert = el('p', 'field-error', error), status = el('p', 'muted', busy || !initialized ? '確認しています…' : notice);
    alert.setAttribute('role', 'alert'); status.setAttribute('role', 'status');
    root.append(alert, status);
    const actions = el('div', 'authentication-actions');
    if (!identity) {
      const google = button('Googleでログイン', () => { void act(() => port.google()); });
      root.append(el('p', '', '主担当・代理管理者はGoogle、公演限定スタッフはメールとパスワードでログインします。'), google);
      const form = el('form', 'authentication-form');
      form.noValidate = true;
      form.append(field('メールアドレス', 'email', email, (value) => { email = value; }),
        field('パスワード', 'password', password, (value) => { password = value; }),
        el('p', 'muted', '半角英字と数字を含む6～20文字'));
      const login = button('メールでログイン', () => {}); login.type = 'submit';
      const reset = button('パスワードを忘れた場合', () => {
        if (!validate(false)) return;
        const address = email;
        void act(() => port.resetPassword(address), '該当するアカウントがある場合、再設定メールを送信しました。メールをご確認ください。');
      }, 'button secondary');
      actions.append(login, reset); form.append(actions); root.append(form);
      // フォーム送信時だけ認証を開始し、入力値をログへ渡さない。
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!validate(true)) return;
        const address = email, credential = password;
        void act(() => port.password(address, credential));
      });
    } else {
      root.append(el('p', 'pill', identity.emailVerified ? (preview ? '見本：本人認証後の表示' : '本人認証済み') : 'メール確認が必要です'));
      if (!identity.emailVerified) {
        root.append(el('p', '', '確認メールのリンクを開いた後、「確認状況を更新」を押してください。'));
        actions.append(button('確認メールを再送', () => { void act(() => port.verification(), '確認メールを送信しました。'); }, 'button secondary'),
          button('確認状況を更新', () => { void act(() => port.refresh()); }, 'button secondary'));
      } else {
        root.append(el('p', '', '公演の権限と端末準備は未確認です。本人認証だけでは業務操作を開始できません。'));
        if (reauth) {
          if (identity.provider === 'password') root.append(
            field('本人確認用パスワード', 'password', password, (value) => { password = value; }),
            el('p', 'muted', '半角英字と数字を含む6～20文字'),
          );
          actions.append(button('本人確認する', () => {
            if (identity?.provider === 'password' && passwordError(password)) { error = `パスワード：${passwordError(password)}。`; render(); return; }
            const credential = password;
            void act(() => port.reauthenticate(credential), '本人確認を更新しました。');
          }));
          actions.append(button('戻る', () => { reauth = false; password = ''; error = ''; render(); }, 'button secondary'));
        } else actions.append(button('本人確認をやり直す', () => { reauth = true; notice = error = ''; render(); }, 'button secondary'));
      }
      actions.append(button('ログアウト', () => { void act(() => port.signOut(), 'ログアウトしました。端末に保存したデータは保持しています。'); }, 'button secondary'));
      root.append(actions);
    }
    for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')) control.disabled = busy || !initialized;
  }

  /** 画面終了後は資格を消さず、購読と平文入力だけを破棄する。 */
  function dispose() { disposed = true; version++; password = email = ''; unsubscribe(); root.replaceChildren(); }

  render();
  const unsubscribe = port.onChange(() => { if (!busy) void refreshState(); });
  void refreshState();
  return { element: root, dispose };
}
