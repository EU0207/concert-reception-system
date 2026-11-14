// 架空公演の席編集を、暗号化された端末下書きと試験用の操作先へつなぐ。

import { changeStage, createLayout, createSection, editUnassignedSeat, extendSection, numberInitial, reconfigureSection, renameSection, slideSection } from '../domain/seats/layout.ts';
import type { CellKind, LayoutCell, Scope, SeatChangePlan, SectionInput, SlideSeatMapCommand } from '../domain/seats/types.ts';
import { displayNumber, SeatDomainError, validateLayout } from '../domain/seats/validation.ts';
import { createSeatDraftStore } from '../storage/seat-drafts.ts';
import { ensureDeviceKey } from '../storage/device-vault.ts';
import { button, el, showDialog } from './dom.ts';
import type { EditorSession, LeaveChoice } from './navigation.ts';
import { createSectionForm, openSectionExtension, openSectionForm, setSeatOptions } from './seat-layout-form.ts';
import { planSectionSettings } from './seat-section-settings.ts';
import { mountSeatCanvasNavigation } from './seat-canvas-navigation.ts';
import type { SeatCanvasView } from './seat-canvas-navigation.ts';
import { openSectionSlide } from './seat-section-slide.ts';
import { openIndividualSeatEdit } from './seat-individual-edit.ts';

const evaluationBinding = {
  humanUid: 'local-evaluation-human',
  deviceUid: 'local-evaluation-device',
  storageEpoch: '00000000-0000-4000-8000-000000000105',
};

const evaluationVersions = {
  layoutRevision: 0, assignmentRevision: 0, ticketRevision: 0, controlRevision: 0, attendeeRevision: 0,
};

const cellLabels = { unset: '未', seat: '席', gap: '欠番', space: '空間', aisle: '通路' } satisfies Record<CellKind, string>;

/** 入力を確かめて適用する。計算が拒否したときはダイアログ内に入力を残す。 */
function editText(
  title: string,
  label: string,
  value: string,
  apply: (text: string) => void,
) {
  const form = el('form', 'seat-input');
  const field = el('label', '', label);
  const input = el('input');
  const error = el('p');
  const submit = el('button', 'button', '変更を反映');

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

/** 同じ公演の下書きを復元し、画面操作と保存・離脱の接続口を組み立てる。 */
export async function openSeatEditor(
  panel: HTMLElement,
  scope: Scope,
  confirmLeave: () => Promise<LeaveChoice>,
): Promise<EditorSession | undefined> {
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
  let savedLayout = layout;
  let editReasons = draft?.editReasons ?? {};
  let savedReasons = { ...editReasons };
  let activeId = layout.sections[0]?.section.sectionId;
  let selectionMode = 'single';
  let rangeStart: LayoutCell | undefined;
  const selected = new Set<string>();
  const canvasViews = new Map<string, SeatCanvasView>();
  let localRevision = draft?.localRevision ?? 0;
  let savedAt = draft?.savedAt;
  let dirty = false;
  let pendingSettings = false;
  let saving = false;
  let switching = false;
  const sections = el('div', 'seat-sections');
  const actions = el('div', 'seat-actions');
  const settings = el('section', 'seat-settings');
  const sectionDetails = el('div', 'seat-section-details');
  const settingsForm = el('div');
  const workspace = el('div', 'seat-workspace');
  const sectionChoice = el('select');
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
      pendingSettings ? '席の設定を変更しています。「設定を反映」で変更前後を確認してください。' :
        dirty ? `未保存の変更があります。 ${saved}` : saved;
    actions.querySelectorAll('button').forEach((node) => { node.disabled = saving || !layout.sections.length; });
    sections.inert = saving || pendingSettings;
    settingsForm.inert = saving;
    sectionDetails.inert = saving || pendingSettings;
    add.disabled = saving || pendingSettings;
    sectionChoice.disabled = saving || switching || layout.sections.length < 2;
  }

  /** 計算が完了した編集案を表示し、端末保存が必要な状態にする。 */
  function applyChange(plan: SeatChangePlan, edit?: { seatId: string; reason: string }) {
    if (!plan.impact.changed) return;

    // 再採番などで席が変わった場合、以前の個別編集と対応しない理由を残さない。
    const changed = new Set(plan.impact.changedSeatIds);
    editReasons = Object.fromEntries(Object.entries(editReasons).filter(([seatId]) => !changed.has(seatId)));
    if (edit) editReasons[edit.seatId] = edit.reason;
    layout = plan.after;
    dirty = true;
    result.textContent = '';
    error.textContent = '';
    renderSections();
    updateStatus();
  }

  /** 切替前に未保存の変更を確認し、保存失敗や取消しでは現在の区画に戻す。 */
  async function switchSection() {
    const target = sectionChoice.value;
    sectionChoice.value = activeId ?? '';
    if (switching || saving || target === activeId) return;

    switching = true;
    try {
      if (dirty || pendingSettings) {
        const choice = await confirmLeave();
        if (!panel.isConnected || choice === 'continue' || (choice === 'save' && !(await save()))) return;
        if (choice === 'discard') {
          layout = savedLayout;
          editReasons = { ...savedReasons };
          dirty = false;
          pendingSettings = false;
          result.textContent = '';
          error.textContent = '';
        }
      }

      activeId = layout.sections.find(({ section }) => section.sectionId === target)?.section.sectionId
        ?? layout.sections[0]?.section.sectionId;
      selected.clear();
      rangeStart = undefined;
      renderSections();
    } finally {
      switching = false;
      updateStatus();
      if (!sectionChoice.disabled) sectionChoice.focus();
    }
  }

  /** 設定変更案を実データへ渡す前に、寸法と席番号の差分を確認する。 */
  function previewSettings(input: SectionInput) {
    previewSectionPlan(planSectionSettings(layout, activeId!, input));
  }

  /** 計算済みの構成案を比較し、確認後に画面の編集内容へ反映する。 */
  function previewSectionPlan(plan: SeatChangePlan, description?: string) {
    const before = layout;
    const sectionId = activeId!;
    if (!plan.impact.changed) {
      pendingSettings = false;
      renderSections();
      updateStatus();
      return;
    }

    const old = before.sections.find(({ section }) => section.sectionId === sectionId)!;
    const next = plan.after.sections.find(({ section }) => section.sectionId === sectionId)!;
    const body = el('div');
    if (description) body.append(el('p', '', description));
    const previousSeats = new Map(old.seats.map((seat) => [seat.seatId, seat]));
    const newSeats = new Map(next.seats.map((seat) => [seat.seatId, seat]));
    let changes = 0;

    for (const id of new Set([...previousSeats.keys(), ...newSeats.keys()])) {
      const a = previousSeats.get(id), b = newSeats.get(id);
      const from = a ? displayNumber(a) : '追加';
      const to = b ? displayNumber(b) : '削除';
      if (from === to) continue;

      changes++;
    }
    body.append(
      el('p', '', `${old.section.rows}行 × ${old.section.columns}列 → ${next.section.rows}行 × ${next.section.columns}列`),
      el('p', '', `席番号の変更・削除 ${changes}件。反映後は下書き保存できます。`),
    );
    const confirm = button('反映する', () => {
      if (layout !== before) {
        dialog.close();
        error.textContent = '表示中の構成が変わりました。設定をもう一度確認してください。';
        return;
      }

      pendingSettings = false;
      selected.clear();
      rangeStart = undefined;
      dialog.close();
      applyChange(plan);
    });
    const dialog = showDialog('席の設定変更を確認', body, [confirm]);
  }

  /** 余白を確認する共通計算へ渡し、確認済みの1区画だけを一括で移動する。 */
  function previewSlide(direction: SlideSeatMapCommand['direction']) {
    const before = layout;
    const sectionId = activeId!;
    const model = before.sections.find((candidate) => candidate.section.sectionId === sectionId)!;
    const { layoutRevision, assignmentRevision, ticketRevision, controlRevision } = baseVersions;

    try {
      const prepared = model.initialNumbered ? before : numberInitial(before, sectionId, {}).after;
      const plan = slideSection(prepared, {
        ...scope, operationId: crypto.randomUUID(), sectionId, direction, amount: 1,
        expectedVersions: { layoutRevision, assignmentRevision, ticketRevision, controlRevision },
      });
      if (!plan.impact.changed) {
        result.textContent = '移動する席構成がありません。';
        return;
      }

      openSectionSlide(model, plan, direction, () => {
        if (layout !== before || activeId !== sectionId || pendingSettings) {
          error.textContent = '編集中の構成が変わりました。移動内容をもう一度確認してください。';
          return;
        }

        // 固定セルIDが移動するため選択を解除し、新しい座標を見てから選び直す。
        selected.clear();
        rangeStart = undefined;
        error.textContent = '';
        applyChange(plan);
      });
    } catch (caught) {
      error.textContent = caught instanceof SeatDomainError && caught.code === 'SLIDE_BOUNDARY_NOT_UNSET'
        ? '移動先側の外周に未設定以外のセルがあります。外周を「未」にしてから移動してください。'
        : '席構成を移動できませんでした。表示中の区画を確認してください。';
    }
  }

  /** モックと同じ個別・複数・始点終点の操作でセルを選択する。 */
  function selectCell(cell: LayoutCell, cells: readonly LayoutCell[]) {
    if (selectionMode === 'multiple') {
      if (!selected.delete(cell.cellId)) selected.add(cell.cellId);
    } else if (selectionMode === 'range' && rangeStart) {
      const top = Math.min(rangeStart.row, cell.row), bottom = Math.max(rangeStart.row, cell.row);
      const left = Math.min(rangeStart.column, cell.column), right = Math.max(rangeStart.column, cell.column);
      selected.clear();
      for (const candidate of cells) {
        if (candidate.row >= top && candidate.row <= bottom && candidate.column >= left && candidate.column <= right) {
          selected.add(candidate.cellId);
        }
      }
      rangeStart = undefined;
    } else {
      selected.clear();
      selected.add(cell.cellId);
      if (selectionMode === 'range') rangeStart = cell;
    }

    renderSections();
    sections.querySelector<HTMLButtonElement>(`[data-cell-id="${cell.cellId}"]`)?.focus({ preventScroll: true });
  }

  /** 選んだ区画だけを、設定・選択情報・座席キャンバスの順に表示する。 */
  function renderSections() {
    const previousCanvas = sections.querySelector<HTMLElement>('.seat-canvas');
    const previousView = previousCanvas?.dataset.sectionId
      ? canvasViews.get(previousCanvas.dataset.sectionId) : undefined;
    if (previousCanvas && previousView) {
      previousView.left = previousCanvas.scrollLeft;
      previousView.top = previousCanvas.scrollTop;
    }

    const names = layout.sections.map(({ section }) => section.name || '指定なし');
    setSeatOptions(sectionChoice, layout.sections.map(({ section }, index) => {
      const name = names[index]!;
      const duplicate = names.indexOf(name) !== names.lastIndexOf(name);

      return [section.sectionId, duplicate ? `${name}（区画 ${index + 1}）` : name];
    }));
    sectionChoice.value = activeId ?? '';
    sectionDetails.replaceChildren();
    settingsForm.replaceChildren();
    sections.replaceChildren();
    const model = layout.sections.find(({ section }) => section.sectionId === activeId);
    if (!model) {
      sections.append(el('p', 'muted', '区画を追加すると座席が表示されます。'));
      return;
    }

    const { section, seats } = model;
    const form = createSectionForm(previewSettings, section, () => {
      pendingSettings = true;
      updateStatus();
    }, () => {
      pendingSettings = false;
      renderSections();
      updateStatus();
    });
    settingsForm.append(form);
    const selection = el('section', 'seat-selection');
    const selectionDetails = el('div', 'seat-selection-details');
    const selectionActions = el('div', 'seat-actions');
    const mode = el('select');
    const modeLabel = el('label', 'seat-field', '選択方法');
    const card = el('section', 'seat-section');
    const canvas = el('div', 'seat-canvas');
    canvas.dataset.sectionId = section.sectionId;
    const map = el('div', `seat-map stage-${section.stagePosition}`);
    const grid = el('div', 'seat-grid');
    const seatsById = new Map(seats.map((seat) => [seat.seatId, seat]));
    const cells = section.cells.filter((cell) => selected.has(cell.cellId));
    const single = cells.length === 1 ? cells[0] : undefined;
    const seat = single?.seatId ? seatsById.get(single.seatId) : undefined;

    setSeatOptions(mode, [['single', '個別'], ['multiple', '複数'], ['range', '範囲（始点→終点）']]);
    mode.value = selectionMode;
    modeLabel.append(mode);
    mode.addEventListener('change', () => {
      selectionMode = mode.value;
      selected.clear();
      rangeStart = undefined;
      renderSections();
      sections.querySelector('select')?.focus();
    });
    const selectionText = seat ? `${displayNumber(seat)} ／ 席` : single ? cellLabels[single.kind] : '';
    selectionDetails.append(el('h3', '', '選択'), el('span', '', selectionText), el('span', '',
      `${cells.length}セル${rangeStart ? '。終点を選んでください。' : ''}`), modeLabel);
    selection.append(selectionDetails);

    for (const [kind, label] of Object.entries(cellLabels)) {
      const change = button(`${label}に`, () => {
        const changes = Object.fromEntries(cells.map((cell) => [cell.cellId, kind as CellKind]));

        try {
          applyChange(model.initialNumbered
            ? reconfigureSection(layout, section.sectionId, { selections: changes })
            : numberInitial(layout, section.sectionId, changes));
          sections.querySelector<HTMLButtonElement>(`[data-cell-id="${cells[0]?.cellId}"]`)?.focus({ preventScroll: true });
        } catch {
          error.textContent = 'セルを変更できませんでした。席番号の重複と選択したセルを確認してください。';
        }
      }, 'button secondary');
      change.disabled = !cells.length;
      selectionActions.append(change);
    }

    if (seat) {
      for (const [mode, label] of [['number', '席番号を変更'], ['position', '席の位置を変更']] as const) {
        const edit = button(label, () => {
          const before = layout;
          openIndividualSeatEdit(model, seat.seatId, mode, editReasons[seat.seatId] ?? '', (input) => {
            if (!panel.isConnected || layout !== before || activeId !== section.sectionId) {
              throw new SeatDomainError('STALE_INDIVIDUAL_EDIT');
            }
            if (mode === 'number' && input.number === displayNumber(seat)) return;
            const plan = editUnassignedSeat(before, section.sectionId, seat.seatId, input);
            selected.clear();
            rangeStart = undefined;
            selected.add(input.targetCellId ?? single!.cellId);
            applyChange(plan, { seatId: seat.seatId, reason: input.reason });
          });
        }, 'button secondary');
        edit.disabled = layout.assignments.some((assignment) => assignment.seatId === seat.seatId);
        selectionActions.append(edit);
      }
      if (seat.numberingMode === 'manual') {
        selectionActions.append(button('自動採番に戻す', () => {
          try {
            previewSectionPlan(reconfigureSection(layout, section.sectionId, {
              automaticSeatIds: [seat.seatId],
            }), '選択した席を自動採番に戻し、区画の採番順で番号を振り直します。他の手動番号は保持します。');
          } catch {
            error.textContent = '自動採番に戻せませんでした。席番号の重複や割当・発券済みの席を確認してください。';
          }
        }, 'button secondary'));
      }
    }
    selection.append(selectionActions);

    sectionDetails.append(el('h3', '', section.name || '指定なし'), el('p', 'muted', `${section.rows}行 × ${section.columns}列 ／ ${section.axis === 'horizontal' ? '横方向' : '縦方向'}`));
    const sectionActions = el('div', 'seat-actions');
    sectionActions.append(button('区画名を変更', () => {
      editText('区画名を変更', '区画名', section.name, (name) => {
        applyChange(renameSection(layout, section.sectionId, name));
      });
    }, 'button secondary'), button(section.stagePosition === 'left' ? '舞台を上に' : '舞台を左に', () => {
      applyChange(changeStage(layout, section.sectionId, section.stagePosition === 'left' ? 'top' : 'left'));
    }, 'button secondary'));
    sectionActions.append(button('行・列を追加', () => {
      openSectionExtension(section, (input) => {
        const prepared = model.initialNumbered ? layout : numberInitial(layout, section.sectionId, {}).after;
        previewSectionPlan(extendSection(prepared, section.sectionId, input));
      });
    }, 'button secondary'));
    sectionDetails.append(sectionActions);
    const slide = el('details', 'seat-slide-tools');
    const slideActions = el('div', 'seat-actions');
    slide.append(el('summary', '', '席構成全体を1マスずらす'),
      el('p', 'muted', '移動先の端がすべて「未」の場合に移動できます。反映前に席構成を確認します。'));
    for (const [direction, label] of [['up', '上へ1行'], ['down', '下へ1行'], ['left', '左へ1列'], ['right', '右へ1列']] as const) {
      slideActions.append(button(label, () => previewSlide(direction), 'button secondary'));
    }
    slide.append(slideActions);
    sectionDetails.append(slide);
    card.append(el('h3', '', '座席キャンバス'));

    const rows = Array.from({ length: section.rows }, () => el('div', 'seat-row'));
    // スライド後も配列の格納順は変わらないため、現在の座標順で描画する。
    for (const cell of [...section.cells].sort((a, b) => a.row - b.row || a.column - b.column)) {
      const current = cell.seatId ? seatsById.get(cell.seatId) : undefined;
      const line = section.lineSettings[section.axis === 'horizontal' ? cell.row : cell.column];
      const number = current ? displayNumber(current) : cell.consumedNumber === undefined
        ? undefined : `${line?.prefix ?? ''}${cell.consumedNumber}`;
      const kind = cellLabels[cell.kind];
      const label = number ?? kind;
      const tile = button(label, () => selectCell(cell, section.cells), `seat-tile cell-${cell.kind}`);
      const manual = current?.numberingMode === 'manual';
      tile.classList.toggle('is-manual', manual);
      if (manual) tile.setAttribute('aria-description', '手動で番号を設定した席');
      tile.dataset.cellId = cell.cellId;
      tile.setAttribute('aria-pressed', String(selected.has(cell.cellId)));
      tile.setAttribute('aria-label', current
        ? `${section.name}の席 ${label} を選択`
        : `${cell.row + 1}行${cell.column + 1}列 ${kind}${number ? ` ${number}` : ''}`);
      if (number) tile.append(el('span', '', manual ? '手動' : kind));
      rows[cell.row]?.append(tile);
    }
    grid.append(...rows);
    map.append(el('div', 'seat-stage-label', '舞台'), grid);
    canvas.append(map);
    card.append(canvas);
    sections.append(selection, card);
    const view = canvasViews.get(section.sectionId) ?? { scale: 1, left: 0, top: 0 };
    canvasViews.set(section.sectionId, view);
    card.append(mountSeatCanvasNavigation(canvas, map, view, () => selected.size === 1 ? [...selected][0] : undefined));
  }

  /** 最後に読んだ版を条件に保存し、失敗時は入力と直前の保存情報を維持する。 */
  async function save() {
    if (saving) return false;
    if (pendingSettings) {
      error.textContent = '先に「設定を反映」で席の設定を確認してください。';
      return false;
    }

    saving = true;
    error.textContent = '';
    result.textContent = '';
    updateStatus();

    try {
      const saved = await store.saveLocalDraft({ draftId, layout, baseVersions, editReasons }, localRevision);
      localRevision = saved.localRevision;
      savedAt = saved.savedAt;
      savedLayout = layout;
      savedReasons = { ...editReasons };
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

  /** 保存先を確認し、実行を選んだ場合にだけこの端末へ保存する。 */
  function confirmDraftSave() {
    const body = el('p', '', 'この端末に下書きを保存します。');
    const confirm = button('保存する', () => {
      dialog.close();
      void save();
    });
    const dialog = showDialog('下書き保存の確認', body, [confirm]);
  }

  /** 確認を経た明示操作だけを、保存完了後に試験用の操作先へ渡す。 */
  function confirmOperation(action: '下書きを共有' | '確定保存') {
    const message = action === '下書きを共有'
      ? '別端末でも確認できるように保存します。この確認版では共有の試験操作を行います。'
      : `端末に下書きを保存してから、確定保存の試験操作を実行します。対象は ${layout.sections.length} 区画です。`;
    const body = el('p', '', message);

    const confirm = button('試験操作を実行', async () => {
      dialog.close();
      if (await save()) result.textContent = runEvaluationOperation(action);
    });
    const dialog = showDialog(`${action}の確認`, body, [confirm]);
  }

  const add = button('区画を追加', () => {
    openSectionForm((input) => {
      const plan = createSection(layout, input);
      activeId = plan.after.sections.at(-1)?.section.sectionId;
      selected.clear();
      rangeStart = undefined;
      applyChange(plan);
    });
  }, 'button secondary');
  const sectionLabel = el('label', 'seat-field', '表示する区画');
  sectionLabel.append(sectionChoice);
  sectionChoice.addEventListener('change', () => { void switchSection(); });
  actions.append(
    button('下書き保存', confirmDraftSave, 'button draft-save'),
    button('下書きを共有', () => confirmOperation('下書きを共有'), 'button secondary'),
    button('確定保存', () => confirmOperation('確定保存')),
  );
  settings.append(el('h2', '', '席の設定'), sectionLabel, add, settingsForm, sectionDetails, actions, error, result, storageNote);
  workspace.append(settings, sections);
  panel.append(workspace);
  renderSections();
  updateStatus();

  return {
    /** 保存対象になる変更があるかを離脱確認へ伝える。 */
    isDirty: () => dirty || pendingSettings,
    /** 保存中は画面を維持し、保存完了後に離脱できるようにする。 */
    isSaving: () => saving || switching,
    save,
    /** 保存済み下書きを維持したまま、画面上の変更を破棄する。 */
    discard: () => { dirty = false; },
  };
}
