// 区画全体を1マスずらす変更案を、移動前後の席表で確認する。

import type { SeatChangePlan, SectionModel, SlideSeatMapCommand } from '../domain/seats/types.ts';
import { displayNumber } from '../domain/seats/validation.ts';
import { button, el, showDialog } from './dom.ts';

const kindNames = { unset: '未', seat: '席', gap: '欠番', space: '空間', aisle: '通路' };

/** 確認用の席表を作る。セルは編集できず、広い構成は枠内でスクロールする。 */
function sectionPreview(model: SectionModel, title: string) {
  const figure = el('figure', 'seat-slide-preview');
  const viewport = el('div', 'seat-slide-viewport');
  const table = el('table', 'seat-slide-table');
  const rows = Array.from({ length: model.section.rows }, () => el('tr'));
  const seats = new Map(model.seats.map((seat) => [seat.seatId, seat]));
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', `${title}の席構成`);
  table.setAttribute('aria-label', title);

  for (const cell of [...model.section.cells].sort((a, b) => a.row - b.row || a.column - b.column)) {
    const seat = cell.seatId ? seats.get(cell.seatId) : undefined;
    const line = model.section.lineSettings[model.section.axis === 'horizontal' ? cell.row : cell.column];
    const number = seat ? displayNumber(seat) : cell.consumedNumber === undefined
      ? undefined : `${line!.prefix}${cell.consumedNumber}`;
    const kind = kindNames[cell.kind];
    const tile = el('td', `seat-slide-cell cell-${cell.kind}`, number ?? kind);
    tile.classList.toggle('is-manual', seat?.numberingMode === 'manual');
    tile.dataset.cellId = cell.cellId;
    if (seat) tile.dataset.seatId = seat.seatId;
    tile.setAttribute('aria-label', `${cell.row + 1}行${cell.column + 1}列 ${kind}${number ? ` ${number}` : ''}`);
    if (number) tile.append(el('span', '', seat?.numberingMode === 'manual' ? '手動' : kind));
    rows[cell.row]!.append(tile);
  }

  table.append(...rows);
  viewport.append(table);
  figure.append(el('figcaption', '', title), viewport);
  return figure;
}

/** 共通計算の移動案を表示し、明示確認した場合だけ呼出元へ反映を依頼する。 */
export function openSectionSlide(
  before: SectionModel,
  plan: SeatChangePlan,
  direction: SlideSeatMapCommand['direction'],
  apply: () => void,
) {
  const after = plan.after.sections.find((model) => model.section.sectionId === before.section.sectionId)!;
  const movement = { up: '上へ1行', down: '下へ1行', left: '左へ1列', right: '右へ1列' }[direction];
  const body = el('div', 'seat-slide-confirmation');
  const previews = el('div', 'seat-slide-previews');
  body.append(
    el('p', '', `「${before.section.name}」の席構成全体を${movement}ずらします。`),
    el('p', '', '席番号・席のID・割当を保持し、空いた側を未設定にします。'),
  );
  previews.append(sectionPreview(before, '移動前'), sectionPreview(after, '移動後'));
  body.append(previews, el('p', 'muted', '反映後は未保存です。下書き保存でこの端末に保存できます。'));
  const confirm = button('移動を反映', () => {
    dialog.close();
    apply();
  });
  const dialog = showDialog('席構成の移動を確認', body, [confirm]);
}
