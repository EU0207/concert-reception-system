import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export class CameraQrScanner {
  private controls?: IScannerControls;
  private readonly reader = new BrowserQRCodeReader(undefined, {
    delayBetweenScanAttempts: 100,
    delayBetweenScanSuccess: 500
  });

  async start(video: HTMLVideoElement, onDecoded: (text: string) => void): Promise<void> {
    this.stop();
    this.controls = await this.reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: "environment" } } },
      video,
      (result) => {
        if (result) onDecoded(result.getText());
      }
    );
  }

  stop(): void {
    this.controls?.stop();
    this.controls = undefined;
  }

  async decodeImageUrl(url: string): Promise<string> {
    return (await this.reader.decodeFromImageUrl(url)).getText();
  }
}
