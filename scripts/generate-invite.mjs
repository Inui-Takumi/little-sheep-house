import { createHash, randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const segment = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
const invite = `SHEEP-${segment()}-${segment()}-${segment()}`;
const hash = createHash("sha256").update(invite, "utf8").digest("hex");

console.log("一次性邀请码（只交给第二位住客）：");
console.log(invite);
console.log("\n写入 Supabase 私有配置的 SHA-256：");
console.log(hash);
