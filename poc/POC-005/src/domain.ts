export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_IMAGE_COUNT = 5;
export const MAX_TOTAL_IMAGE_BYTES = 25_000_000;

export type SeatKind = "一般" | "車椅子" | "同伴者" | "使用不可" | "確保済み";

export interface Seat {
  id: string;
  floor: "1階" | "2階";
  section: string;
  row: number;
  number: number;
  kind: SeatKind;
}

export interface VenueImage {
  id: string;
  label: string;
  url: string;
  mimeType: "image/png" | "image/jpeg";
  byteLength: number;
  sha256: string;
}

export interface ImageCandidate {
  name: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  totalBytes: number;
}

export function createFakeSeats(): Seat[] {
  const seats: Seat[] = [];
  const addFloor = (floor: Seat["floor"], rows: number, perRow: number): void => {
    for (let row = 1; row <= rows; row += 1) {
      for (let number = 1; number <= perRow; number += 1) {
        const globalIndex = seats.length + 1;
        let kind: SeatKind = "一般";
        if (globalIndex % 97 === 0) kind = "使用不可";
        else if (globalIndex % 71 === 0) kind = "確保済み";
        else if (number === 1 && row % 3 === 0) kind = "車椅子";
        else if (number === 2 && row % 3 === 0) kind = "同伴者";
        const section = number <= perRow / 2 ? "西" : "東";
        seats.push({
          id: `${floor === "1階" ? "F1" : "F2"}-${section}-${String(row).padStart(2, "0")}-${String(number).padStart(2, "0")}`,
          floor,
          section,
          row,
          number,
          kind
        });
      }
    }
  };
  addFloor("1階", 15, 20);
  addFloor("2階", 10, 20);
  return seats;
}

export function validateImages(candidates: readonly ImageCandidate[]): ValidationResult {
  const errors: string[] = [];
  if (candidates.length > MAX_IMAGE_COUNT) errors.push(`画像は${MAX_IMAGE_COUNT}枚までです。`);
  let totalBytes = 0;
  for (const candidate of candidates) {
    totalBytes += candidate.bytes.byteLength;
    if (candidate.bytes.byteLength > MAX_IMAGE_BYTES) errors.push(`${candidate.name}は5,000,000バイトを超えています。`);
    const detected = detectImageMimeType(candidate.bytes);
    if (!detected) errors.push(`${candidate.name}はPNGまたはJPEGではありません。`);
    else if (detected !== candidate.declaredMimeType) errors.push(`${candidate.name}の形式と内容が一致しません。`);
    const extension = candidate.name.toLowerCase().split(".").pop();
    const expectedExtension = detected === "image/png" ? "png" : detected === "image/jpeg" ? ["jpg", "jpeg"] : [];
    if (detected && !expectedExtension.includes(extension ?? "")) errors.push(`${candidate.name}の拡張子と内容が一致しません。`);
  }
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) errors.push("画像の合計は25,000,000バイトまでです。");
  return { valid: errors.length === 0, errors, totalBytes };
}

export function detectImageMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | undefined {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return undefined;
}

export function orderSeats(seats: readonly Seat[], direction: "asc" | "desc"): Seat[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...seats].sort((left, right) => {
    const floor = left.floor.localeCompare(right.floor, "ja");
    if (floor !== 0) return floor;
    const section = left.section.localeCompare(right.section, "ja");
    if (section !== 0) return section;
    if (left.row !== right.row) return left.row - right.row;
    return (left.number - right.number) * factor;
  });
}
