// 画面と変換Workerで共有する入力容量と変換結果の型。

export const PHOTO_INPUT_MAX_BYTES = 20_000_000;
export interface ConvertedPhoto {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}
