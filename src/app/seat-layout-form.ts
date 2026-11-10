// 区画の寸法と採番設定を入力し、未設定の座席表を作るためのフォーム。

import type { Axis, SeatOrder, SectionInput } from '../domain/seats/types.ts';
import { button, el, showDialog } from './dom.ts';

/** フォーム部品とその入力名を組にする。 */
function field(label: string, control: HTMLInputElement | HTMLSelectElement) {
  const wrapper = el('label', 'seat-field', label);
  wrapper.append(control);

  return wrapper;
}

/** 指定した初期値と範囲を持つ必須の数値入力欄を作る。 */
function numberInput(value: number, max = 30) {
  const input = el('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(max);
  input.value = String(value);
  input.required = true;

  return input;
}

/** コードと表示名を持つ選択肢を、指定の順番で追加する。 */
export function setSeatOptions(select: HTMLSelectElement, options: readonly (readonly [string, string])[]) {
  select.replaceChildren(...options.map(([value, name]) => {
    const option = el('option', '', name);
    option.value = value;

    return option;
  }));
}

/** モックの初期寸法から区画を作り、寸法・方向・列ごとの設定を反映する。 */
export function openSectionForm(apply: (input: SectionInput) => void) {
  const form = el('form', 'seat-input');
  const name = el('input');
  const rows = numberInput(5);
  const columns = numberInput(8);
  const axis = el('select');
  const order = el('select');
  const dimensions = el('div', 'seat-form-row');
  const lineDetails = el('details');
  const lineFields = el('div', 'seat-line-fields');
  const error = el('p');
  let lineInputs: { name: HTMLInputElement; start: HTMLInputElement }[] = [];

  /** 縦横の設定に応じて、既存の列入力を保持しながら必要な列を並べる。 */
  function renderLines() {
    const count = (axis.value === 'horizontal' ? rows : columns).valueAsNumber;
    const previousOrder = order.value || 'forward';
    const directions = axis.value === 'horizontal' ? ['左から', '右から'] : ['上から', '下から'];
    setSeatOptions(order, [['forward', directions[0]!], ['reverse', directions[1]!]]);
    order.value = previousOrder;
    if (!Number.isInteger(count) || count < 1 || count > 30) return;

    lineInputs = Array.from({ length: count }, (_, index) => {
      const lineName = el('input');
      lineName.required = true;
      lineName.value = lineInputs[index]?.name.value ?? (index < 26 ? String.fromCharCode(65 + index) : `列${index + 1}`);
      const start = numberInput(1, Number.MAX_SAFE_INTEGER);
      start.value = lineInputs[index]?.start.value ?? '1';

      return { name: lineName, start };
    });
    lineFields.replaceChildren(...lineInputs.map((line, index) => {
      const fields = el('div', 'seat-form-row');
      fields.append(field(`${index + 1}列の名前`, line.name), field(`${index + 1}列の開始番号`, line.start));

      return fields;
    }));
  }

  name.required = true;
  error.setAttribute('role', 'alert');
  setSeatOptions(axis, [['horizontal', '横方向'], ['vertical', '縦方向']]);
  renderLines();
  dimensions.append(field('縦', rows), field('横', columns), field('列の並び', axis), field('席番の順序', order));
  lineDetails.append(el('summary', '', '列名・開始番号'), lineFields);
  const submit = el('button', 'button', '追加する');
  form.append(field('区画名', name), dimensions, lineDetails, error, submit);
  const dialog = showDialog('区画を追加', form);

  rows.addEventListener('input', renderLines);
  columns.addEventListener('input', renderLines);
  axis.addEventListener('change', renderLines);
  lineDetails.addEventListener('invalid', () => { lineDetails.open = true; }, true);
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    try {
      apply({
        name: name.value.trim(), rows: rows.valueAsNumber, columns: columns.valueAsNumber,
        axis: axis.value as Axis, seatOrder: order.value as SeatOrder,
        lines: lineInputs.map((line) => ({ name: line.name.value.trim(), prefix: `${line.name.value.trim()}-`, startNumber: line.start.valueAsNumber })),
      });
      dialog.close();
    } catch {
      error.textContent = '区画を追加できませんでした。区画数、セル数、列名と開始番号を確認してください。';
    }
  });
  name.focus();
}
