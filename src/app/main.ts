// 共通画面の入口。起動設定を確認した後、URLに応じた画面と操作を組み立てる。

import './styles.css';
import { startApplication } from './bootstrap.ts';
import type { StartupResult } from './bootstrap.ts';
import { APP_VERSION, StartupError } from './config.ts';
import { button, el, showDialog } from './dom.ts';
import { NavigationGate } from './navigation.ts';
import type { LeaveChoice } from './navigation.ts';
import { registerPwa } from './pwa.ts';

// # 本文：画面状態の準備と表示・操作の処理

const root = document.querySelector<HTMLElement>('#app')!;
const gate = new NavigationGate();

// 保存機能の接続前に画面移動を確認するための架空データ。
const events = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: '秋の室内楽コンサート',
    date: '2026年11月22日（日）14:00',
    venue: '架空市民ホール 小ホール',
    series: '室内楽シリーズ',
    seats: '座席の準備前',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: '冬のピアノリサイタル',
    date: '2026年12月13日（日）14:00',
    venue: '架空文化センター',
    series: 'リサイタル',
    seats: '座席の準備前',
  },
];
let startup: StartupResult,
  currentRoute = location.hash.slice(1) || '/events';
let main: HTMLElement, statusButton: HTMLButtonElement, updateBanner: HTMLElement;
let pwaReady = false;

/** ブラウザーの通信状態と設定の取得元から、接続状態の表示を選ぶ。 */
function connectionLabel() {
  return !navigator.onLine
    ? '通信できません'
    : startup?.source === 'device'
      ? '接続を確認できません'
      : 'ローカル確認';
}

/** 接続状態と端末準備の確認範囲を表示する。未接続の機能は成功扱いにしない。 */
function connectionDialog() {
  const body = el('div');

  body.append(
    el('p', 'pill', connectionLabel()),
    el('p', '', 'この環境は外部サービスへ接続しません。架空の公演で画面移動を確認できます。'),
    el('p', '', '端末準備：未実施 ／ 未送信件数：未取得'),
    el('p', '', 'オフライン保存は、画面の起動に必要な設定・静的ファイルだけが対象です。'),
  );
  showDialog('接続と端末の状態', body);
}

/** 未保存の変更があるときに、保存・破棄・編集続行の選択を受け取る。 */
async function leaveDialog(): Promise<LeaveChoice> {
  return new Promise((resolve) => {
    let choice: LeaveChoice = 'continue';
    const body = el('p', '', 'この画面で変更した内容があります。保存してから移動できます。');
    const dialog = showDialog('変更が保存されていません', body);
    const footer = dialog.querySelector('.dialog-actions')!;

    footer.replaceChildren();

    /** 選ばれた離脱方法を記録し、確認ダイアログを閉じる。 */
    const decide = (value: LeaveChoice) => {
      choice = value;
      dialog.close();
    };

    footer.append(
      button('保存して移動', () => decide('save')),
      button('保存せず移動', () => decide('discard'), 'button secondary'),
      button('編集を続ける', () => decide('continue'), 'button secondary'),
    );
    (footer.lastElementChild as HTMLElement).focus();
    dialog.addEventListener('close', () => resolve(choice), { once: true });
  });
}

/** 未保存の変更を確認してから、URLの履歴と表示画面を切り替える。 */
async function navigate(route: string, fromHistory = false) {
  if (route === currentRoute) return;

  try {
    if (!(await gate.leave(leaveDialog))) {
      if (fromHistory) history.replaceState(null, '', `#${currentRoute}`);

      return;
    }

    currentRoute = route;

    if (!fromHistory) history.pushState(null, '', `#${route}`);

    renderPage();
  } catch {
    if (fromHistory) history.replaceState(null, '', `#${currentRoute}`);

    const text = el('p', '', '保存できませんでした。入力はそのまま残っています。');

    showDialog('保存できません', text);
  }
}

/** アプリ内の移動リンクを作る。修飾キー付きの操作はブラウザーに任せる。 */
function routeLink(label: string, route: string, className = '') {
  const a = el('a', className, label);

  a.href = `#${route}`;
  a.addEventListener('click', (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      void navigate(route);
    }
  });

  return a;
}

/** サイドメニューの移動先を作る。 */
function menuItems() {
  const nav = el('nav', 'menu-links');

  nav.setAttribute('aria-label', 'メインメニュー');
  nav.append(routeLink('公演一覧', '/events'), routeLink('このアプリについて', '/about'));

  return nav;
}

/** メニュー・ヘッダー・本文領域からなる共通の画面枠を作る。 */
function renderShell() {
  const shell = el('div', 'shell'),
    side = el('aside', 'side');

  side.id = 'app-menu';
  side.setAttribute('aria-label', '画面メニュー');

  const brand = el('div', 'brand');

  brand.append(el('span', 'brand-icon', '▦'), el('span', '', 'コンサート受付'));

  const heading = el('div', 'side-heading');
  const closeButton = button('×', () => setMenu(false), 'button secondary menu-close');

  closeButton.setAttribute('aria-label', 'メニューを閉じる');
  heading.append(brand, closeButton);
  side.append(
    heading,
    el('p', 'side-caption', '準備から、当日の受付まで'),
    menuItems(),
    el('p', 'side-footer', '架空データでのローカル確認'),
  );

  // ヘッダーと本文を、メニュー表示中に操作を止められる共通領域へまとめる。
  const content = el('div', 'content'),
    environment = el('div', 'environment', `${startup.config.environmentName} · 架空データのみ`);
  const header = el('header', 'topbar');
  const start = el('div', 'header-start');
  const menuButton = button('☰', () => setMenu(true), 'button secondary mobile-menu');

  menuButton.setAttribute('aria-label', 'メニューを開く');
  menuButton.setAttribute('aria-controls', side.id);
  menuButton.setAttribute('aria-expanded', 'false');
  start.append(menuButton, routeLink('公演一覧', '/events', 'home-link'));

  const backdrop = button('', () => setMenu(false), 'drawer-backdrop');

  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'メニューを閉じる');

  const narrow = matchMedia('(max-width: 900px)');
  let menuOpen = false;

  /** 小画面のメニューを開閉する。表示中は背景操作を止め、閉じた後はフォーカスを戻す。 */
  function setMenu(open: boolean, restoreFocus = true) {
    menuOpen = open && narrow.matches;
    side.classList.toggle('open', menuOpen);
    backdrop.hidden = !menuOpen;
    content.inert = menuOpen;
    document.body.classList.toggle('menu-open', menuOpen);
    menuButton.setAttribute('aria-expanded', String(menuOpen));

    if (menuOpen) closeButton.focus();
    else if (restoreFocus) menuButton.focus();
  }

  side.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a') && menuOpen) setMenu(false);
  });
  // Escapeで閉じ、Tab移動は開いているメニュー内に保つ。
  document.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setMenu(false);
    }
    if (e.key === 'Tab') {
      const focusable = [...side.querySelectorAll<HTMLElement>('button, a[href]')];
      const first = focusable[0]!,
        last = focusable.at(-1)!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  narrow.addEventListener('change', () => {
    if (menuOpen) {
      setMenu(false, false);
      main.focus({ preventScroll: true });
    }
  });
  window.addEventListener('popstate', () => {
    if (menuOpen) setMenu(false, false);
  });

  // 接続状態・更新通知と本文の入れ物を作り、完成した共通枠を画面へ配置する。
  statusButton = button(connectionLabel(), connectionDialog, 'status-button');
  statusButton.setAttribute('aria-label', '接続と端末の状態');
  header.append(start, statusButton);
  updateBanner = el('div', 'update-banner');
  updateBanner.hidden = true;
  updateBanner.setAttribute('role', 'status');
  main = el('main', 'main');
  main.id = 'main';
  main.tabIndex = -1;
  content.append(environment, header, updateBanner, main);
  shell.append(side, backdrop, content);
  root.replaceChildren(shell);
  renderPage();
}

/** 画面の見出しと説明を共通の構造で作る。 */
function pageHeading(eyebrow: string, title: string, description: string) {
  const heading = el('div', 'page-heading');

  heading.append(el('p', 'eyebrow', eyebrow), el('h1', '', title), el('p', 'lead', description));

  return heading;
}

/** 現在のURLに対応する本文を描画し、選択中のメニューとページ名を更新する。 */
function renderPage() {
  main.replaceChildren();

  // 公演一覧・アプリ情報・公演準備の順で、URLに対応する本文を選ぶ。
  if (currentRoute === '/events') {
    main.append(pageHeading('CONCERT RECEPTION', '公演一覧', '確認する公演を選んでください。'));

    const notice = el('div', 'notice');

    notice.append(
      el('strong', '', '共通画面の操作を確認できます'),
      el(
        'p',
        '',
        '公演の選択、画面の移動、接続状態の表示をお試しください。名簿・席設定・受付の操作は、今後利用できるようになります。',
      ),
    );
    main.append(notice);

    const list = el('div', 'event-list');

    for (const event of events) {
      const card = routeLink('', `/events/${event.id}`, 'event-card');
      const date = el('div', 'date-tile');
      const match = event.date.match(/(\d+)月(\d+)日/)!;

      date.append(el('span', '', `${match[1]}月`), el('strong', '', match[2]!));

      const details = el('div', 'event-details');

      details.append(
        el('span', 'pill', '準備中'),
        el('h2', '', event.name),
        el('p', 'event-date', event.date),
        el('p', 'muted', event.venue),
      );
      card.append(date, details, el('span', 'card-arrow', '→'));
      list.append(card);
    }

    main.append(
      list,
      el('p', 'footnote', '公演と会場はすべて架空です。実際の公演情報は登録されていません。'),
    );
    document.title = '公演一覧 | コンサート受付';
  } else if (currentRoute === '/about') {
    main.append(
      routeLink('← 公演一覧へ', '/events', 'back-link'),
      pageHeading('INFORMATION', 'このアプリについて', '利用環境と、現在確認できる範囲です。'),
    );

    const card = el('section', 'panel');

    card.append(
      el('h2', '', '利用環境'),
      el('p', '', startup.config.environmentName),
      el('p', '', `アプリ版 ${APP_VERSION}`),
      el(
        'p',
        '',
        pwaReady
          ? '起動に必要なファイルをこの端末に保存しました。'
          : 'オフライン起動の準備状況を確認しています。',
      ),
      el('p', 'muted', '認証、名簿、席設定と受付の保存・共有は、まだ接続されていません。'),
    );
    main.append(card);
    document.title = 'このアプリについて | コンサート受付';
  } else {
    const event = events.find((item) => currentRoute === `/events/${item.id}`);

    main.append(routeLink('← 公演一覧へ', '/events', 'back-link'));

    if (!event) {
      main.append(
        pageHeading(
          'NOT FOUND',
          '画面が見つかりません',
          '公演一覧から、もう一度公演を選んでください。',
        ),
      );
    } else {
      main.append(pageHeading('公演準備', event.name, `${event.date} ／ ${event.venue}`));

      const card = el('section', 'panel');

      card.append(
        el('span', 'pill', '準備中'),
        el('h2', '', '公演の準備'),
        el('p', '', '公演を選択しました。準備の各機能は、順次利用できるようになります。'),
      );

      const grid = el('div', 'feature-grid');

      for (const label of [
        'お客様情報',
        '会場席の編集',
        'お客様の席を設定',
        'チケットデータ出力',
      ]) {
        const item = el('div', 'feature');
        const b = button(label, () => {}, 'button secondary');

        b.disabled = true;
        item.append(b, el('span', 'muted', '準備中'));
        grid.append(item);
      }

      card.append(grid);
      main.append(card, el('p', 'footnote', '端末準備：未実施 ／ 利用者の認証：未接続'));
      document.title = `${event.name} | コンサート受付`;
    }
  }

  document.querySelectorAll<HTMLAnchorElement>('.menu-links a').forEach((a) => {
    if (a.hash === `#${currentRoute}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** 起動を止めた理由を表示する。端末に保存済みのデータは削除しない。 */
function showStartupError(error: unknown) {
  const code = error instanceof StartupError ? error.code : 'STORAGE_UNAVAILABLE';
  const messages: Record<string, string> = {
    INVALID_CONFIG:
      '利用環境の設定が正しくありません。管理者に設定とアプリ版の確認を依頼してください。',
    CONFIG_UNAVAILABLE:
      '利用環境の設定を取得できません。初回は通信できる状態で設定を確認してください。',
    ENVIRONMENT_MISMATCH:
      'このブラウザーに保存された利用環境と設定が異なります。保存データは削除せず、管理者に確認してください。',
    INVALID_STORED_CONFIG:
      'この端末の設定を確認できません。保存データは削除せず、管理者に確認してください。',
    SECURE_STORAGE_REQUIRED:
      '安全な接続と端末内保存が必要です。HTTPSで開くか、PCではlocalhostから開いてください。',
    AUTH_ADAPTER_REQUIRED:
      'この版では実環境の認証に接続できません。管理者に対応するアプリ版を確認してください。',
    STORAGE_UNAVAILABLE:
      'この端末へ設定を保存できません。ブラウザーの保存設定と空き容量を確認してください。',
  };
  const page = el('main', 'startup-error');

  page.append(
    el('p', 'eyebrow', 'コンサート受付'),
    el('h1', '', '利用を開始できません'),
    el('p', '', messages[code] ?? messages.STORAGE_UNAVAILABLE!),
    button('もう一度確認する', () => location.reload()),
  );
  root.replaceChildren(page);
}

// 通信状態やブラウザーの履歴操作を、画面表示へ反映する。
window.addEventListener('online', () => {
  if (statusButton) statusButton.textContent = connectionLabel();
});
window.addEventListener('offline', () => {
  if (statusButton) statusButton.textContent = connectionLabel();
});
window.addEventListener('popstate', () => {
  void navigate(location.hash.slice(1) || '/events', true);
});
window.addEventListener('beforeunload', (e) => {
  if (gate.isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.querySelector<HTMLAnchorElement>('a.skip')?.addEventListener('click', (event) => {
  event.preventDefault();
  main?.focus();
});

// 起動確認が成功した後だけ画面を作り、オフライン起動の準備を進める。
try {
  startup = await startApplication();
  renderShell();
  void registerPwa(
    () => {
      updateBanner.textContent =
        '新しいアプリ版の準備ができました。作業と送信を終えてから、すべてのアプリ画面を閉じて開き直してください。';
      updateBanner.hidden = false;
    },
    () => {
      pwaReady = true;

      if (currentRoute === '/about') renderPage();
    },
  ).catch(() => {
    updateBanner.textContent =
      'オフライン起動の準備を完了できませんでした。通信できる状態で開き直してください。';
    updateBanner.hidden = false;
  });
} catch (error) {
  showStartupError(error);
}
