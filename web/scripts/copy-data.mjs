import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const src = resolve("../data/bonuses.json");
const dst = resolve("public/bonuses.json");
mkdirSync("public", { recursive: true });
if (!existsSync(src)) {
  console.warn("data/bonuses.json missing; run the scraper first. Using empty dataset.");
  copyFileSync(resolve("src/data/empty.json"), dst);
} else {
  copyFileSync(src, dst);
}
