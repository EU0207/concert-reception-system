import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import type { FakeTicket } from "./domain";

export const A6_WIDTH_POINTS = 297.64;
export const A6_HEIGHT_POINTS = 419.53;
const CANVAS_WIDTH = 744;
const CANVAS_HEIGHT = 1052;

export interface GeneratedZip {
  blob: Blob;
  fileCount: number;
  fileNames: string[];
}

export async function renderTicketCanvas(ticket: FakeTicket): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを利用できません。");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = "#183a37";
  context.fillRect(0, 0, CANVAS_WIDTH, 96);
  context.fillStyle = "#ffffff";
  context.font = "bold 34px sans-serif";
  context.fillText("電子チケット（架空データ）", 44, 61);

  context.fillStyle = "#172421";
  context.font = "bold 30px sans-serif";
  context.fillText(ticket.performanceName, 44, 150);
  context.font = "24px sans-serif";
  const lines = [
    `日時　${ticket.performanceAt}`,
    `氏名　${ticket.attendeeName}`,
    `会場　${ticket.venueName}`,
    `住所　${ticket.venueAddress}`,
    `座席　${ticket.seat.floorSection} ${ticket.seat.row} ${ticket.seat.number}`
  ];
  lines.forEach((line, index) => context.fillText(line, 44, 205 + index * 48));

  const qrDataUrl = await QRCode.toDataURL(ticket.qrToken, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 360,
    color: { dark: "#000000", light: "#ffffff" }
  });
  const qrImage = await loadImage(qrDataUrl);
  context.drawImage(qrImage, 192, 440, 360, 360);

  context.font = "bold 28px monospace";
  context.textAlign = "center";
  context.fillText(`確認コード ${ticket.confirmationCode}`, CANVAS_WIDTH / 2, 850);
  context.font = "20px sans-serif";
  context.fillStyle = "#4c5f5a";
  context.fillText("QRを読み取れない場合は確認コードを使用してください", CANVAS_WIDTH / 2, 895);
  context.fillText(ticket.ticketId, CANVAS_WIDTH / 2, 940);
  context.font = "18px sans-serif";
  context.fillText("POC-003専用・実在する公演や来場者ではありません", CANVAS_WIDTH / 2, 990);
  context.textAlign = "start";
  return canvas;
}

export async function generateTicketPdf(ticket: FakeTicket): Promise<Uint8Array> {
  const canvas = await renderTicketCanvas(ticket);
  const pngBytes = await canvasToBytes(canvas);
  const document = await PDFDocument.create();
  const page = document.addPage([A6_WIDTH_POINTS, A6_HEIGHT_POINTS]);
  const image = await document.embedPng(pngBytes);
  page.drawImage(image, { x: 0, y: 0, width: A6_WIDTH_POINTS, height: A6_HEIGHT_POINTS });
  return document.save();
}

export async function generateTicketZip(
  tickets: FakeTicket[],
  onProgress?: (completed: number, total: number) => void
): Promise<GeneratedZip> {
  const zip = new JSZip();
  const fileNames: string[] = [];
  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];
    if (!ticket) continue;
    const fileName = `FAKE-P003-${String(index + 1).padStart(4, "0")}.pdf`;
    zip.file(fileName, await generateTicketPdf(ticket));
    fileNames.push(fileName);
    onProgress?.(index + 1, tickets.length);
  }
  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    fileCount: fileNames.length,
    fileNames
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number; width: number; height: number }> {
  const document = await PDFDocument.load(bytes);
  const pages = document.getPages();
  const first = pages[0];
  if (!first) throw new Error("PDFにページがありません。");
  const size = first.getSize();
  return { pageCount: pages.length, width: size.width, height: size.height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("QR画像を読み込めません。"));
    image.src = url;
  });
}

function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("チケット画像を生成できません。"));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}
