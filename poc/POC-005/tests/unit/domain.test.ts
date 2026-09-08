import { describe, expect, it } from "vitest";
import { createFakeSeats, MAX_IMAGE_BYTES, validateImages } from "../../src/domain";

const png = (size: number, name = "image.png") => {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  return { name, declaredMimeType: "image/png", bytes };
};

describe("架空座席", () => {
  it("2階層で500席を生成し、特別区分を含む", () => {
    const seats = createFakeSeats();
    expect(seats).toHaveLength(500);
    expect(seats.filter((seat) => seat.floor === "1階")).toHaveLength(300);
    expect(seats.filter((seat) => seat.floor === "2階")).toHaveLength(200);
    expect(new Set(seats.map((seat) => seat.kind))).toEqual(new Set(["一般", "車椅子", "同伴者", "使用不可", "確保済み"]));
  });
});

describe("画像境界", () => {
  it("1枚5,000,000バイトかつ5枚合計25,000,000バイトを許可する", () => {
    const result = validateImages(Array.from({ length: 5 }, (_, index) => png(MAX_IMAGE_BYTES, `image-${index}.png`)));
    expect(result.valid).toBe(true);
    expect(result.totalBytes).toBe(25_000_000);
  });

  it("1枚の1バイト超過を拒否する", () => {
    const result = validateImages([png(MAX_IMAGE_BYTES + 1)]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("5,000,000");
  });

  it("6枚目を拒否する", () => {
    const result = validateImages(Array.from({ length: 6 }, (_, index) => png(16, `image-${index}.png`)));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("5枚");
  });

  it("合計の1バイト超過を拒否する", () => {
    const result = validateImages([png(5_000_000), png(5_000_000), png(5_000_000), png(5_000_000), png(5_000_001)]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("25,000,000");
  });

  it("PDFと拡張子偽装を拒否する", () => {
    const pdf = { name: "fake.png", declaredMimeType: "image/png", bytes: new Uint8Array([37, 80, 68, 70]) };
    const disguised = png(16, "fake.jpg");
    expect(validateImages([pdf]).valid).toBe(false);
    expect(validateImages([disguised]).valid).toBe(false);
  });
});
