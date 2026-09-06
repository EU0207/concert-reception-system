export const ROLES = ["owner", "deputy", "receptionist", "temporaryAdmin"] as const;
export type Role = (typeof ROLES)[number];

export type Operation =
  | "readPublic"
  | "manageReception"
  | "manageMembers"
  | "readRestricted"
  | "exportRestricted"
  | "permanentDelete";

export interface Membership {
  uid: string;
  eventId: string;
  role: Role;
  active: boolean;
  expiresAt?: string;
}

export interface PreparationState {
  eventId: string;
  uid: string;
  role: Role;
  preparedAt: string;
  referenceCount: number;
  pendingCount: number;
  adminSecretReady: boolean;
}

export interface OptionalFieldDefinition {
  key: string;
  label: string;
}

export interface OptionalFieldInput {
  visitorId: string;
  values: Record<string, string>;
}

export function isMembershipActive(membership: Membership, now = new Date()): boolean {
  if (!membership.active) return false;
  if (!membership.expiresAt) return true;
  return new Date(membership.expiresAt).getTime() > now.getTime();
}

export function may(role: Role, operation: Operation): boolean {
  const permissions: Record<Role, readonly Operation[]> = {
    owner: ["readPublic", "manageReception", "manageMembers", "readRestricted", "exportRestricted", "permanentDelete"],
    deputy: ["readPublic", "manageReception", "manageMembers", "readRestricted", "exportRestricted", "permanentDelete"],
    receptionist: ["readPublic", "manageReception"],
    temporaryAdmin: ["readPublic", "manageReception", "permanentDelete"]
  };
  return permissions[role].includes(operation);
}

export function canStartOffline(state: PreparationState | undefined, now = new Date()): boolean {
  if (!state) return false;
  if (!state.eventId || !state.uid || state.referenceCount < 1) return false;
  if ((state.role === "owner" || state.role === "deputy") && !state.adminSecretReady) return false;
  return new Date(state.preparedAt).getTime() <= now.getTime();
}

export function validateDefinitions(definitions: readonly OptionalFieldDefinition[]): void {
  if (definitions.length > 10) throw new Error("任意項目は10件までです。");
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (!definition.key.trim() || !definition.label.trim()) throw new Error("項目IDと項目名は必須です。");
    if (keys.has(definition.key)) throw new Error("項目IDが重複しています。");
    keys.add(definition.key);
  }
}

export function validateOptionalInput(
  definitions: readonly OptionalFieldDefinition[],
  input: OptionalFieldInput
): void {
  validateDefinitions(definitions);
  const allowed = new Set(definitions.map((definition) => definition.key));
  for (const [key, value] of Object.entries(input.values)) {
    if (!allowed.has(key)) throw new Error(`未定義の任意項目です: ${key}`);
    if (value.length > 200) throw new Error(`${key}は200文字以内です。`);
  }
}

export function restrictedCsvHeaders(
  baseHeaders: readonly string[],
  selectedKeys: readonly string[],
  role: Role
): string[] {
  if (selectedKeys.length > 0 && !may(role, "exportRestricted")) {
    throw new Error("任意項目を含むCSVを出力する権限がありません。");
  }
  return [...baseHeaders, ...selectedKeys];
}
