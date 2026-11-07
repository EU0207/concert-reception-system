// 画面移動と編集処理の接続口。保存に失敗した場合は移動を許可せず、入力を保持する。

// # 本文：未保存の変更を確認する画面移動

/** 編集画面が提供する、未保存判定・保存と破棄の処理。 */
export interface EditorSession {
  isDirty(): boolean;
  save(): Promise<boolean>;
  discard(): void;
}

/** 未保存の変更を残して移動しようとしたときの選択肢。 */
export type LeaveChoice = 'save' | 'discard' | 'continue';

/** 未保存離脱の確認を管理し、確認や保存中の二重要求を防ぐ。 */
export class NavigationGate {
  editor: EditorSession | undefined;
  private busy = false;

  /** 現在の編集画面に、未保存の変更があるか返す。 */
  get isDirty() {
    return this.editor?.isDirty() ?? false;
  }

  /** 変更があれば確認し、保存成功または明示的な破棄の場合だけ移動を許可する。 */
  async leave(confirm: () => Promise<LeaveChoice>): Promise<boolean> {
    if (this.busy) return false;
    if (!this.isDirty) return true;

    this.busy = true;

    const editor = this.editor!;

    try {
      const choice = await confirm();

      if (choice === 'continue') return false;
      if (choice === 'save') return await editor.save();

      editor.discard();

      return true;
    } finally {
      this.busy = false;
    }
  }
}
