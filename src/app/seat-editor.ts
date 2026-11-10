// 架空公演の席編集を、暗号化された端末下書きと試験用の操作先へつなぐ。

import { createLayout, createSection, editUnassignedSeat, numberInitial, renameSection } from '../domain/seats/layout.ts';
import type { Scope, SeatChangePlan, SeatLayout } from '../domain/seats/types.ts';
import { displayNumber, SeatDomainError, validateLayout } from '../domain/seats/validation.ts';
import { createSeatDraftStore } from '../storage/seat-drafts.ts';
import { ensureDeviceKey } from '../storage/device-vault.ts';
import { button, el, showDialog } from './dom.ts';
import type { EditorSession } from './navigation.ts';

const evaluationBinding = {
  humanUid: 'local-evaluation-human',
  deviceUid: 'local-evaluation-device',
  storageEpoch: '00000000-0000-4000-8000-000000000105',
};

const evaluationVersions = {
  layoutRevision: 0, assignmentRevision: 0, ticketRevision: 0, controlRevision: 0, attendeeRevision: 0,
};

/** 架空公演の区画に、画面で編集できる2列分の座席を作る。 */
function addSampleSection(layout: SeatLayout, name: string): SeatChangePlan {
  const added = createSection(layout, {
    name, rows: 2, columns: 4, axis: 'horizontal', seatOrder: 'forward',
    lines: [{ name: 'A', prefix: 'A-' }, { name: 'B', prefix: 'B-' }],
  }).after;
  const section = added.sections.at(-1)!.section;
  const seats = Object.fromEntries(section.cells.map((cell) => [cell.cellId, 'seat' as const]));

  return numberInitial(added, section.sectionId, seats);
}

/** 入力を確かめて適用する。計算が拒否したときはダイアログ内に入力を残す。 */
function editText(
  title: string,
  label: string,
  value: string,
  apply: (text: string) => void,
  submitLabel = '変更を反映',
) {
  const form = el('form', 'seat-input');
  const field = el('label', '', label);
  const input = el('input');
  const error = el('p');
  const submit = el('button', 'button', submitLabel);

  input.required = true;
  input.value = value;
  error.setAttribute('role', 'alert');
  field.append(input);
  form.append(field, error, submit);

  const dialog = showDialog(title, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    try {
      apply(input.value.trim());
      dialog.close();
    } catch {
      error.textContent = '入力を反映できませんでした。空欄、文字数、重複を確認してください。';
    }
  });
  input.focus();
}

/** ローカル評価専用の操作先で、端末保存後の共有と確定を区別して返す。 */
function runEvaluationOperation(action: '下書きを共有' | '確定保存') {
  return `「${action}」の試験操作が完了しました。端末下書きは未確定のままです。`;
}

/** ボタンの下に保存先を表示し、読み上げでもボタンの説明として伝える。 */
function describeSaveAction(action: HTMLButtonElement, noteId: string, text: string) {
  const group = el('div', 'seat-action');
  const note = el('p', 'seat-action-note', text);

  note.id = noteId;
  action.setAttribute('aria-describedby', noteId);
  group.append(action, note);

  return group;
}

/** 同じ公演の下書きを復元し、画面操作と保存・離脱の接続口を組み立てる。 */
export async function openSeatEditor(panel: HTMLElement, scope: Scope): Promise<EditorSession | undefined> {
  const binding = { ...scope, ...evaluationBinding };

  /** 公演の編集画面が閉じられた後は、端末保存の処理を継続しない。 */
  function assertActive() {
    if (!panel.isConnected) throw new Error('SEAT_EDITOR_CLOSED');
  }

  const store = createSeatDraftStore(binding, assertActive);
  const status = el('p', '', '端末の下書きを確認しています。');
  status.setAttribute('role', 'status');
  panel.append(status);

  const draft = await store.loadLocalDraft();
  if (!draft) {
    assertActive();
    await ensureDeviceKey(binding, true);
  }
  if (!panel.isConnected) return;

  const draftId = draft?.draftId ?? crypto.randomUUID();
  const baseVersions = draft?.baseVersions ?? evaluationVersions;
  let layout = draft ? validateLayout(draft.layout) : createLayout(scope);
  let localRevision = draft?.localRevision ?? 0;
  let savedAt = draft?.savedAt;
  let dirty = false;
  let saving = false;
  const sections = el('div', 'seat-sections');
  const actions = el('div', 'seat-actions');
  const result = el('p');
  const error = el('p');
  const storageNote = el('p', 'muted');
  result.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');

  /** 最後の保存時刻と、その後に変更した内容の有無を表示する。 */
  function updateStatus() {
    const saved = savedAt === undefined ? '端末への保存前です。' :
      `この端末に保存済み・未確定（${new Date(savedAt).toLocaleString('ja-JP')}）`;

    status.textContent = saving ? '端末に下書きを保存しています。' :
      dirty ? `未保存の変更があります。 ${saved}` : saved;
    actions.querySelectorAll('button').forEach((node) => { node.disabled = saving || !layout.sections.length; });
    sections.inert = saving;
    add.disabled = saving;
  }

  /** 計算が完了した編集案を表示し、端末保存が必要な状態にする。 */
  function applyChange(plan: SeatChangePlan) {
    layout = plan.after;
    dirty = true;
    result.textContent = '';
    error.textContent = '';
    renderSections();
    updateStatus();
  }

  /** 区画と座席の一覧を描画し、各操作から既存の席計算を呼び出す。 */
  function renderSections() {
    sections.replaceChildren();
    if (!layout.sections.length) sections.append(el('p', 'muted', '区画を追加すると座席が表示されます。'));

    for (const { section, seats } of layout.sections) {
      const card = el('section', 'seat-section');
      const grid = el('div', 'seat-grid');
      const seatsById = new Map(seats.map((seat) => [seat.seatId, seat]));

      card.append(el('h3', '', section.name), button('区画名を変更', () => {
        editText('区画名を変更', '区画名', section.name, (name) => {
          applyChange(renameSection(layout, section.sectionId, name));
        });
      }, 'button secondary'));

      for (const cell of section.cells) {
        const seat = cell.seatId ? seatsById.get(cell.seatId) : undefined;
        if (!seat) {
          grid.append(el('span', 'muted', '空欄'));
          continue;
        }

        const number = displayNumber(seat);
        const edit = button(number, () => {
          editText('席番号を変更', '席番号', number, (next) => {
            if (next === number) return;
            applyChange(editUnassignedSeat(layout, section.sectionId, seat.seatId, {
              number: next, reason: 'ローカル評価での番号編集',
            }));
          });
        }, 'button secondary');

        edit.setAttribute('aria-label', `${section.name}の席 ${number} を編集`);
        grid.append(edit);
      }

      card.append(grid);
      sections.append(card);
    }
  }

  /** 最後に読んだ版を条件に保存し、失敗時は入力と直前の保存情報を維持する。 */
  async function save() {
    if (saving) return false;

    saving = true;
    error.textContent = '';
    result.textContent = '';
    updateStatus();

    try {
      const saved = await store.saveLocalDraft({ draftId, layout, baseVersions }, localRevision);
      localRevision = saved.localRevision;
      savedAt = saved.savedAt;
      dirty = false;
      if (saved.persistence === 'unavailable') {
        storageNote.textContent = 'ブラウザーが保存領域の永続化を許可していません。保存した下書きが自動消去される場合があります。';
      }

      return true;
    } catch (cause) {
      error.textContent = cause instanceof SeatDomainError && cause.code === 'STALE_SEAT_DRAFT'
        ? '別のタブで下書きが更新されました。上書きせず、この画面に変更を残しています。'
        : '端末に保存できませんでした。この画面に変更を残しています。';

      return false;
    } finally {
      saving = false;
      updateStatus();
    }
  }

  /** 確認を経た明示操作だけを、保存完了後に試験用の操作先へ渡す。 */
  function confirmOperation(action: '下書きを共有' | '確定保存') {
    const body = el('div');
    if (action === '下書きを共有') {
      body.append(el('p', '', '下書きを共有すると、ほかの管理担当者が別の端末で編集を引き継げます。'));
    }
    body.append(el('p', '', `端末に下書きを保存してから「${action}」の試験操作を実行します。対象は ${layout.sections.length} 区画です。`));

    const confirm = button('試験操作を実行', async () => {
      dialog.close();
      if (await save()) result.textContent = runEvaluationOperation(action);
    });
    const dialog = showDialog(`${action}の確認`, body, [confirm]);
  }

  const add = button('区画を追加', () => {
    editText('区画を追加', '区画名', '', (name) => {
      applyChange(addSampleSection(layout, name));
    }, '追加する');
  }, 'button secondary');
  actions.append(
    describeSaveAction(
      button('下書き保存', () => { void save(); }, 'button draft-save'),
      'seat-draft-save-note',
      'この端末に下書きを保存',
    ),
    describeSaveAction(
      button('下書きを共有', () => confirmOperation('下書きを共有'), 'button secondary'),
      'seat-draft-share-note',
      '別端末でも確認できるように保存します',
    ),
    button('確定保存', () => confirmOperation('確定保存')),
  );
  panel.append(actions, error, result, storageNote, add, sections);
  renderSections();
  updateStatus();

  return {
    /** 保存対象になる変更があるかを離脱確認へ伝える。 */
    isDirty: () => dirty,
    /** 保存中は画面を維持し、保存完了後に離脱できるようにする。 */
    isSaving: () => saving,
    save,
    /** 保存済み下書きを維持したまま、画面上の変更を破棄する。 */
    discard: () => { dirty = false; },
  };
}
