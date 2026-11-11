// 新規・既存区画の寸法と採番設定を受け付けるフォーム。

import type { Axis, ExtensionInput, LayoutSection, SeatOrder, SectionInput } from '../domain/seats/types.ts';
import { SEAT_LIMITS } from '../domain/seats/validation.ts';
import { el, showDialog } from './dom.ts';

/** フォーム部品とその入力名を組にする。 */
function field(label: string, control: HTMLInputElement | HTMLSelectElement) {
  const wrapper = el('label', 'seat-field', label);
  wrapper.append(control);

  return wrapper;
}

/** 指定した初期値と範囲を持つ必須の数値入力欄を作る。 */
function numberInput(value: number, max: number) {
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

/** 現在値または推奨初期値で、区画の設定入力を組み立てる。 */
export function createSectionForm(
  apply: (input: SectionInput) => void,
  initial?: LayoutSection,
  onEdit: () => void = () => {},
) {
  const form = el('form', 'seat-input');
  const name = el('input');
  const rows = numberInput(initial?.rows ?? 5, SEAT_LIMITS.linesPerSection);
  const columns = numberInput(initial?.columns ?? 8, SEAT_LIMITS.cells);
  const axis = el('select');
  const order = el('select');
  const dimensions = el('div', 'seat-form-row');
  const lineDetails = el('details');
  const lineFields = el('div', 'seat-line-fields');
  const error = el('p');
  let lineInputs: { name: HTMLInputElement; prefix: HTMLInputElement; start: HTMLInputElement }[] = [];

  /** 縦横の設定に応じて、既存の列入力を保持しながら必要な列を並べる。 */
  function renderLines() {
    const horizontal = axis.value === 'horizontal';
    const count = (horizontal ? rows : columns).valueAsNumber;
    const previousOrder = order.value || 'forward';
    const directions = horizontal ? ['左から', '右から'] : ['上から', '下から'];
    rows.max = String(horizontal ? SEAT_LIMITS.linesPerSection : SEAT_LIMITS.cells);
    columns.max = String(horizontal ? SEAT_LIMITS.cells : SEAT_LIMITS.linesPerSection);
    setSeatOptions(order, [['forward', directions[0]!], ['reverse', directions[1]!]]);
    order.value = previousOrder;
    if (!Number.isInteger(count) || count < 1 || count > SEAT_LIMITS.linesPerSection || count === lineInputs.length) return;

    lineInputs = Array.from({ length: count }, (_, index) => {
      const lineName = el('input');
      lineName.required = true;
      const prior = initial?.lineSettings[index];
      lineName.value = lineInputs[index]?.name.value ?? prior?.name ?? (index < 26 ? String.fromCharCode(65 + index) : `列${index + 1}`);
      const prefix = el('input');
      prefix.value = lineInputs[index]?.prefix.value ?? prior?.prefix ?? `${lineName.value}-`;
      let previousName = lineName.value;
      lineName.addEventListener('input', () => {
        if (!initial && prefix.value === `${previousName}-`) prefix.value = `${lineName.value}-`;
        previousName = lineName.value;
      });
      const start = numberInput(1, Number.MAX_SAFE_INTEGER);
      start.value = lineInputs[index]?.start.value ?? String(prior?.startNumber ?? 1);

      return { name: lineName, prefix, start };
    });
    lineFields.replaceChildren(...lineInputs.map((line, index) => {
      const fields = el('div', 'seat-form-row');
      fields.append(field(`${index + 1}列の名前`, line.name), field(`${index + 1}列の接頭部`, line.prefix), field(`${index + 1}列の開始番号`, line.start));

      return fields;
    }));
  }

  name.required = true;
  name.value = initial?.name ?? '';
  error.setAttribute('role', 'alert');
  setSeatOptions(axis, [['horizontal', '横方向'], ['vertical', '縦方向']]);
  axis.value = initial?.axis ?? 'horizontal';
  renderLines();
  order.value = initial?.seatOrder ?? 'forward';
  dimensions.append(field('縦', rows), field('横', columns), field('列の並び', axis), field('席番の順序', order));
  lineDetails.append(el('summary', '', '列名・開始番号'), lineFields);
  const submit = el('button', 'button', initial ? '設定を反映' : '追加する');
  if (!initial) form.append(field('区画名', name));
  form.append(dimensions, lineDetails, error, submit);

  rows.addEventListener('input', renderLines);
  columns.addEventListener('input', renderLines);
  axis.addEventListener('change', renderLines);
  lineDetails.addEventListener('invalid', () => { lineDetails.open = true; }, true);
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    try {
      apply({
        name: initial?.name ?? name.value.trim(), rows: rows.valueAsNumber, columns: columns.valueAsNumber,
        axis: axis.value as Axis, seatOrder: order.value as SeatOrder,
        lines: lineInputs.map((line) => ({ name: line.name.value.trim(), prefix: line.prefix.value, startNumber: line.start.valueAsNumber })),
      });
    } catch {
      error.textContent = '設定を反映できませんでした。入力内容と、割当・発券済みの席への影響を確認してください。';
    }
  });

  return form;
}

/** 区画作成ダイアログを開き、入力を適用できた場合だけ閉じる。 */
export function openSectionForm(apply: (input: SectionInput) => void) {
  const form = createSectionForm((input) => {
    apply(input);
    dialog.close();
  });
  const dialog = showDialog('区画を追加', form);
  form.querySelector('input')?.focus();
}

/** 既存番号を保持する追加方向と列設定を入力し、拡張の変更案へ渡す。 */
export function openSectionExtension(section: LayoutSection, apply: (input: ExtensionInput) => void) {
  const form = el('form', 'seat-input');
  const dimension = el('select');
  const count = numberInput(1, SEAT_LIMITS.cells);
  const lines = el('div');
  const error = el('p');
  let newLines: { name: HTMLInputElement; prefix: HTMLInputElement; start: HTMLInputElement }[] = [];

  /** 採番列を増やす方向を選んだ場合、新しい列だけの設定を表示する。 */
  function renderLines() {
    const addsLines = dimension.value === (section.axis === 'horizontal' ? 'rows' : 'columns');
    const size = addsLines ? count.valueAsNumber : 0;
    lines.replaceChildren();
    if (!Number.isSafeInteger(size) || size < 0 || size > SEAT_LIMITS.linesPerSection) return;

    newLines = Array.from({ length: size }, (_, index) => {
      const name = el('input');
      name.required = true;
      name.value = newLines[index]?.name.value ?? `追加列${index + 1}`;
      const prefix = el('input');
      prefix.value = newLines[index]?.prefix.value ?? `${name.value}-`;
      const start = numberInput(1, Number.MAX_SAFE_INTEGER);
      start.value = newLines[index]?.start.value ?? '1';
      const group = el('div', 'seat-form-row');
      group.append(field(`追加${index + 1}列の名前`, name), field(`追加${index + 1}列の接頭部`, prefix), field(`追加${index + 1}列の開始番号`, start));
      lines.append(group);

      return { name, prefix, start };
    });
  }

  const top = section.axis === 'vertical' && section.seatOrder === 'reverse';
  const left = section.axis === 'horizontal' && section.seatOrder === 'reverse';
  setSeatOptions(dimension, [['rows', top ? '上に行を追加' : '下に行を追加'], ['columns', left ? '左に列を追加' : '右に列を追加']]);
  error.setAttribute('role', 'alert');
  renderLines();
  form.append(el('p', '', '既存の席番号を保って外周に追加します。追加セルは「未」になります。'),
    field('追加方向', dimension), field('追加数', count), lines, error, el('button', 'button', '追加内容を確認'));
  const dialog = showDialog('行・列を追加', form);
  dimension.addEventListener('change', renderLines);
  count.addEventListener('input', renderLines);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      apply({ dimension: dimension.value as 'rows' | 'columns', count: count.valueAsNumber,
        ...(newLines.length ? { lines: newLines.map((line) => ({ name: line.name.value.trim(), prefix: line.prefix.value, startNumber: line.start.valueAsNumber })) } : {}),
      });
      dialog.close();
    } catch {
      error.textContent = '追加できませんでした。区画全体のセル数と列設定を確認してください。';
    }
  });
}
