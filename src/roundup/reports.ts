import type { AltTextTracker } from "./tracker";

const formatPercentage = (value: number) => `${Math.round(value)}%`;
const LINKS = {
  alt: "https://www.perkins.org/resource/how-write-alt-text-and-image-descriptions-visually-impaired/",
  optin:
    "https://github.com/discuit-community/alt-text-bot/blob/main/CONSENT.md",
  roundups: "https://discuit.org/@alttextbot/lists/roundup",
};

function generateTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerRow, separator, body].join("\n");
}

export async function generateWeeklyReport(
  tracker: AltTextTracker,
): Promise<string> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const dateRange = `${dateFormat.format(startDate)} – ${dateFormat.format(endDate)}`;

  const title = `Alt Text Roundup — ${dateRange}`;

  const topUsers = tracker.getTopUsersByAltTextPercentage(7);
  const topCommunities = tracker.getTopCommunitiesByAltTextPercentage(7);
  const totals = tracker.getTotals();

  const nbsp = " "; // unicode em space (U+2003) for indenting

  const userTable = generateTable(
    ["User", "% Described", "Described Posts", "Total Posts"],
    topUsers.map((u) => [
      u.username,
      `${Math.round(u.percentage)}%`,
      u.count.toString(),
      u.total.toString(),
    ]),
  );

  const communityTable = generateTable(
    ["Community", "% Described", "Described Posts", "Total Posts"],
    topCommunities.map((c) => [
      c.community,
      `${Math.round(c.percentage)}%`,
      c.count.toString(),
      c.total.toString(),
    ]),
  );

  let report = "";
  report += `# ${title}\n`;
  report += `PLACEHOLDER\n\n`;
  report += `${nbsp}\n\n`;
  report += `**This week’s snapshot:**\n\n`;
  report += `${nbsp}📸 **${totals.totalImagePosts} image posts** from **${totals.userCount} users** across **${totals.communityCount} communities**\n\n`;
  const altTotal =
    totals.imagePostsWithAltByHumans + totals.imagePostsWithAltByBot;
  const altPercent = Math.round(
    (altTotal / (totals.totalImagePosts || 1)) * 100,
  );
  report += `${nbsp}✨ **${altTotal} posts (${altPercent}%)** had alt text (${totals.imagePostsWithAltByHumans} added by humans, ${totals.imagePostsWithAltByBot} by altbot)\n\n`;
  report += `${nbsp}\n\n`;

  report += `## 🏆 Top Contributors\n\n`;
  report += userTable + "\n\n";
  report += `## 🏡 Top Communities\n\n`;
  report += communityTable + "\n\n";
  report += `${nbsp}\n\n`;

  report += `PLACEHOLDER\n\n`;
  report += `${nbsp}\n\n`;
  report += `[what is alt text?](${LINKS.alt}) | [opt-in to alttextbot](${LINKS.optin}) | [all weekly roundups](${LINKS.roundups})\n`;

  tracker.saveWeeklyReport({
    topUsers,
    topCommunities,
    totals,
  });

  return report;
}

export async function generateDailyReport(
  tracker: AltTextTracker,
): Promise<string> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const dateRange = `${dateFormat.format(startDate)} – ${dateFormat.format(endDate)}`;

  const totals = tracker.getTotalsForRange(startDate, endDate);

  const altTotal =
    totals.imagePostsWithAltByHumans + totals.imagePostsWithAltByBot;
  const altPercent = Math.round(
    (altTotal / (totals.totalImagePosts || 1)) * 100,
  );

  let report = "";
  report += `# 📅 Daily Accessibility Report (${dateRange})\n\n`;
  report += `**image posts:** ${totals.totalImagePosts}\n\n`;
  report += `**with alt text:** ${altTotal} (${altPercent}%)\n`;
  report += ` • by humans: ${totals.imagePostsWithAltByHumans}\n\n`;
  report += ` • by alttextbot: ${totals.imagePostsWithAltByBot}\n\n`;
  report += `**without alt text:** ${totals.totalImagePosts - altTotal}\n\n`;
  report += `this is an automated post | [what is alt text?](${LINKS.alt}) | [opt-in to alttextbot](${LINKS.optin})\n`;

  return report;
}
