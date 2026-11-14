// 未割当席の番号・位置の変更前後と理由を確認する入力画面。

import type { SectionModel } from '../domain/seats/types.ts';
import { displayNumber, SEAT_LIMITS, SeatDomainError } from '../domain/seats/validation.ts';
import { el, showDialog } from './dom.ts';

type IndividualEdit = { number?: string; targetCellId?: string; reason: string };

/** 入力名と入力欄を対応付ける。 */
function field(label: string, input: HTMLInputElement) {
  const wrapper = el('label', 'seat-field', label);
  wrapper.append(input);
  return wrapper;
}

/** 入力値を反映した場合の番号・位置を示し、理由を確認してから変更を依頼する。 */
export function openIndividualSeatEdit(
  model: SectionModel,
  seatId: string,
  mode: 'number' | 'position',
  reasonValue: string,
  apply: (input: IndividualEdit) => void,
) {
  const seat = model.seats.find((candidate) => candidate.seatId === seatId)!;
  const source = model.section.cells.find((cell) => cell.seatId === seatId)!;
  const label = displayNumber(seat);
  const form = el('form', 'seat-input');
  const preview = el('p');
  const number = el('input');
  const row = el('input');
  const column = el('input');
  const reason = el('input');
  const error = el('p');
  const submit = el('button', 'button', '変更を反映');
  error.setAttribute('role', 'alert');
  form.append(el('p', '', `変更前：${label} ／ ${source.row + 1}行${source.column + 1}列`));
  if (mode === 'number') {
    number.value = label;
    number.required = true;
    number.maxLength = SEAT_LIMITS.displayNumber;
    number.pattern = '.*\\S.*';
    form.append(field('席番号', number));
  } else {
    const position = el('div', 'seat-form-row');
    for (const [input, maximum] of [[row, model.section.rows], [column, model.section.columns]] as const) {
      input.type = 'number';
      input.min = '1';
      input.max = String(maximum);
      input.required = true;
    }
    position.append(field('移動先の行', row), field('移動先の列', column));
    form.append(position, el('p', 'muted', '「未」または「空間」へ移動できます。移動元は「空間」になります。別の採番列へ移す場合も番号を保持し、「手動」と表示します。'));
  }
  reason.required = true;
  reason.pattern = '.*\\S.*';
  reason.maxLength = SEAT_LIMITS.reason;
  reason.value = reasonValue;
  form.append(preview, field('変更理由', reason), error, submit);

  /** 入力中の変更後表示を更新する。 */
  function updatePreview() {
    preview.textContent = mode === 'number' ? `変更後：${number.value || '未入力'} ／ ${source.row + 1}行${source.column + 1}列`
      : `変更後：${label} ／ ${row.value || '未入力'}行${column.value || '未入力'}列`;
  }

  [number, row, column].forEach((input) => input.addEventListener('input', updatePreview));
  updatePreview();
  const dialog = showDialog(mode === 'number' ? '席番号を変更' : '席の位置を変更', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const target = model.section.cells.find((cell) => cell.row === row.valueAsNumber - 1 && cell.column === column.valueAsNumber - 1);
      if (mode === 'position' && !target) throw new SeatDomainError('INVALID_MOVE_TARGET');
      apply({ ...(mode === 'number' ? { number: number.value.trim() } : { targetCellId: target!.cellId }), reason: reason.value.trim() });
      dialog.close();
    } catch (caught) {
      error.textContent = caught instanceof SeatDomainError && caught.code === 'OCCUPIED_MOVE_TARGET'
        ? '移動先には「未」または「空間」を指定してください。'
        : caught instanceof SeatDomainError && caught.code === 'STALE_INDIVIDUAL_EDIT'
          ? '編集中の構成が変わりました。閉じてから変更をやり直してください。'
          : '変更できませんでした。番号の重複、入力内容と割当・発券済みの席を確認してください。';
    }
  });
  (mode === 'number' ? number : row).focus();
}
