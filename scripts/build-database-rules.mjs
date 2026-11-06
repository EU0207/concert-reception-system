// 認可ルールの生成だけを行う。Firebaseへの配備は行わない。
import { writeFile } from "node:fs/promises";
import { generateDatabaseRules } from "../firebase/authorization-rules.mjs";

const target = new URL("../firebase/database.rules.json", import.meta.url);
await writeFile(
  target,
  JSON.stringify(generateDatabaseRules(), null, 2) + "\n",
);
console.log("Generated product authorization rules. No deployment performed.");
