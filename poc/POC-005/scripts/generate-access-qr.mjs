import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";

const targetUrl = process.argv[2];
if (!targetUrl || !targetUrl.startsWith("https://")) throw new Error("HTTPSの確認URLを引数に指定してください。");
const outputDirectory = resolve("artifacts", "raw");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "poc-005-access-qr.png");
await QRCode.toFile(outputPath, targetUrl, { errorCorrectionLevel: "M", margin: 4, width: 900 });
console.log(outputPath);
