// 区画全体を1マスずらす変更案を、移動前後の席表で確認する。

import type { SeatChangePlan, SectionModel, SlideSeatMapCommand } from '../domain/seats/types.ts';
import { displayNumber } from '../domain/seats/validation.ts';
import { button, el, showDialog } from './dom.ts';

const kindNames = { unset: '未', seat: '席', gap: '欠番', space: '空間', aisle: '通路' };

/** 確認用の席表を作り、移動で空く端を示す。セルは編集できない。 */
function sectionPreview(model: SectionModel, title: string, direction?: SlideSeatMapCommand['direction']) {
  const figure = el('figure', 'seat-slide-preview');
  const viewport = el('div', 'seat-slide-viewport');
  const table = el('table', 'seat-slide-table');
  const rows = Array.from({ length: model.section.rows }, () => el('tr'));
  const seats = new Map(model.seats.map((seat) => [seat.seatId, seat]));
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
    const vacated = direction === 'right' ? cell.column === 0
      : direction === 'left' ? cell.column === model.section.columns - 1
        : direction === 'down' ? cell.row === 0 : direction === 'up' && cell.row === model.section.rows - 1;
    tile.classList.toggle('is-vacated', vacated);
    if (vacated) tile.setAttribute('aria-description', '移動で未設定になる端');
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

/** 席表全体が枠へ収まる倍率にそろえ、ダイアログ幅の変化にも追従する。 */
function fitPreviews(dialog: HTMLDialogElement) {
  const viewports = [...dialog.querySelectorAll<HTMLElement>('.seat-slide-viewport')];

  /** 変形前の席表寸法から倍率を求め、縦横比を保って中央へ配置する。 */
  function fit() {
    for (const viewport of viewports) {
      const table = viewport.querySelector<HTMLTableElement>('table')!;
      const scale = Math.min(1, (viewport.clientWidth - 12) / table.offsetWidth,
        (viewport.clientHeight - 12) / table.offsetHeight);
      table.style.transform = `translate(-50%, -50%) scale(${Math.max(0, scale)})`;
    }
  }

  const observer = new ResizeObserver(fit);
  viewports.forEach((viewport) => observer.observe(viewport));
  dialog.addEventListener('close', () => observer.disconnect(), { once: true });
  fit();
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
  const vacatedEdge = { up: '下端1行', down: '上端1行', left: '右端1列', right: '左端1列' }[direction];
  const body = el('div', 'seat-slide-confirmation');
  const previews = el('div', 'seat-slide-previews');
  body.append(
    el('p', '', `「${before.section.name}」の席構成全体を${movement}ずらします。`),
    el('p', '', '席番号・席のID・割当を保持し、空いた側を未設定にします。'),
    el('p', '', `移動後は${vacatedEdge}が「未」になります。枠線で示しています。`),
  );
  previews.append(sectionPreview(before, '移動前'), sectionPreview(after, '移動後', direction));
  body.append(previews, el('p', 'muted', '反映後は未保存です。下書き保存でこの端末に保存できます。'));
  const confirm = button('移動を反映', () => {
    dialog.close();
    apply();
  });
  const dialog = showDialog('席構成の移動を確認', body, [confirm]);
  fitPreviews(dialog);
}
