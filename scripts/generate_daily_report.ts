import { AltTextTracker } from "../src/roundup/tracker";
import { generateDailyReport } from "../src/roundup/reports";
import fs from "node:fs";

async function main() {
  const tracker = new AltTextTracker();
  await tracker.initialize();

  const report = await generateDailyReport(tracker);
  await fs.promises.writeFile("DAILY_REPORT.md", report);
  console.log("daily report written to DAILY_REPORT.md");
}

void main().catch(console.error);
