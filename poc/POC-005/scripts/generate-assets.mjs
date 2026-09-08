import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "generated-assets");
const imageOutput = resolve(output, "venue-images");
await mkdir(imageOutput, { recursive: true });

const plans = [
  { file: "floor-1-overview.png", format: "png", floor: "1階", color: "#28666e", accent: "#f4a261" },
  { file: "floor-1-east.jpg", format: "jpeg", floor: "1階 東側", color: "#355070", accent: "#eaac8b" },
  { file: "floor-1-west.png", format: "png", floor: "1階 西側", color: "#386641", accent: "#dda15e" },
  { file: "floor-2-overview.jpg", format: "jpeg", floor: "2階", color: "#5f4b8b", accent: "#f6bd60" },
  { file: "floor-2-accessible.png", format: "png", floor: "2階 特別席", color: "#264653", accent: "#e76f51" }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const manifest = [];

for (const [index, plan] of plans.entries()) {
  const seatRows = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 12 }, (_, seat) => {
      const special = (row * 12 + seat + index) % 17 === 0;
      return `<span class="seat${special ? " special" : ""}">${row + 1}-${seat + 1}</span>`;
    }).join("")
  ).join("");
  await page.setContent(`<!doctype html><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f3e8;font-family:Arial,sans-serif;color:#17252a}
    main{width:1280px;height:900px;padding:70px;background:linear-gradient(135deg,#f7f3e8,#e7e0cc)}
    h1{margin:0 0 18px;font-size:54px;color:${plan.color}}p{font-size:24px;margin:0 0 36px}
    .stage{margin:auto;width:72%;height:82px;border-radius:50% 50% 12px 12px;background:${plan.color};color:white;text-align:center;padding:24px;font-weight:bold;letter-spacing:.25em}
    .map{display:grid;grid-template-columns:repeat(12,1fr);gap:10px;margin-top:48px;transform:perspective(800px) rotateX(8deg)}
    .seat{display:grid;place-items:center;height:54px;border-radius:14px;background:white;border:3px solid ${plan.color};font-size:14px;font-weight:bold}
    .special{background:${plan.accent};border-color:#5b3924}.legend{margin-top:34px;display:flex;gap:26px;font-size:20px}
  </style><main><h1>架空会場 ${plan.floor}</h1><p>POC-005用の合成画像です。実在する会場とは関係ありません。</p><div class="stage">STAGE</div><div class="map">${seatRows}</div><div class="legend"><span>□ 一般席</span><span>■ 特別席</span><span>画像 ${index + 1}/5</span></div></main>`);
  const path = resolve(imageOutput, plan.file);
  await page.screenshot({ path, type: plan.format, quality: plan.format === "jpeg" ? 88 : undefined });
  const bytes = await readFile(path);
  manifest.push({
    id: `venue-${index + 1}`,
    label: `${plan.floor} 案内図`,
    url: `/venue-images/${plan.file}`,
    mimeType: plan.format === "jpeg" ? "image/jpeg" : "image/png",
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

await browser.close();
await writeFile(resolve(imageOutput, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(resolve(output, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#173b40"/><path d="M112 140h288v232H112z" fill="#f7f3e8"/><path d="M152 188h208M152 236h208M152 284h208M152 332h208" stroke="#e76f51" stroke-width="22" stroke-linecap="round"/></svg>\n`, "utf8");

const totalBytes = manifest.reduce((sum, item) => sum + item.byteLength, 0);
console.log(`Generated ${manifest.length} synthetic images (${totalBytes} bytes).`);
