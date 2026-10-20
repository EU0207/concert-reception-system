export interface EditorSession {
  isDirty(): boolean;
  save(): Promise<boolean>;
  discard(): void;
}
export type LeaveChoice = 'save' | 'discard' | 'continue';
export class NavigationGate {
  editor: EditorSession | undefined;
  private busy = false;
  get isDirty() { return this.editor?.isDirty() ?? false; }
  async leave(confirm: () => Promise<LeaveChoice>): Promise<boolean> {
    if (this.busy) return false;
    if (!this.isDirty) return true;
    this.busy = true;
    const editor = this.editor!;
    try {
      const choice = await confirm();
      if (choice === 'continue') return false;
      if (choice === 'save') return await editor.save();
      editor.discard(); return true;
    } finally { this.busy = false; }
  }
}
