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

  const snapshotSection = () => {
    const a = totals.totalImagePosts,
      b = totals.userCount,
      c = totals.communityCount;

    const d = totals.imagePostsWithAltByHumans + totals.imagePostsWithAltByBot,
      e = Math.round((d / (totals.totalImagePosts || 1)) * 100),
      f = totals.imagePostsWithAltByHumans,
      g = totals.imagePostsWithAltByBot;

    return (
      `**This week’s snapshot:**\n\n` +
      ` 📸 **${a} image posts** from **${b} users** across **${c} communities**` +
      `\n\n` +
      ` ✨ **${d} posts (${e}%)** had alt text (${f} added by humans, ${g} by altbot)` +
      `\n\n`
    );
  };

  const leaderboardSection = (): string => {
    const tables = {
      users: {
        title: "Top Users",
        table: generateTable(
          ["User", "% Described", "# Described", "Total Posts"],
          topUsers.map((u) => [
            u.username,
            `${Math.round(u.percentage)}%`,
            u.count.toString(),
            u.total.toString(),
          ]),
        ),
      },
      communities: {
        title: "Top Communities",
        table: generateTable(
          ["Community", "% Described", "# Described", "Total Posts"],
          topCommunities.map((c) => [
            c.community,
            `${Math.round(c.percentage)}%`,
            c.count.toString(),
            c.total.toString(),
          ]),
        ),
      },
    };

    const leaderboardString = Object.entries(tables)
      .map(([_key, value]) => {
        return `## ${value.title}\n${value.table}\n\n`;
      })
      .join("");

    return leaderboardString;
  };

  const linksSection = () => {
    const links = [
      { name: "what is alt text?", url: LINKS.alt },
      { name: "opt-in to alttextbot", url: LINKS.optin },
      { name: "all weekly roundups", url: LINKS.roundups },
    ];

    const linkVariables = links
      .map((link) => `[${link.name}]: ${link.url}`)
      .join("\n");

    const linkSection = `${links.map((link) => `[${link.name}]`).join(" | ")}\n\n${linkVariables}\n\n`;
    return linkSection;
  };

  const report =
    `<PLACEHOLDER - add text here>\n\n---\n` +
    snapshotSection() +
    leaderboardSection() +
    linksSection() +
    "\n\n";

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

  const links = [
    { name: "what is alt text?", url: LINKS.alt },
    { name: "opt-in to alttextbot", url: LINKS.optin },
  ];

  let report =
    `Daily Roundup - ${dateRange}\n\n` +
    `**Image posts:** ${totals.totalImagePosts}\n\n` +
    ` **With alt text:** ${altTotal} (${altPercent}%)\n\n` +
    `  • By humans: ${totals.imagePostsWithAltByHumans}\n\n` +
    `  • By alttextbot: ${totals.imagePostsWithAltByBot}\n\n` +
    ` **Without alt text:** ${totals.totalImagePosts - altTotal}\n\n\n` +
    `this is a post | ${links.map((link) => `[${link.name}]`).join(" | ")}\n\n\n\n`;

  const linkVariables = links
    .map((link) => `[${link.name}]: ${link.url}`)
    .join("\n");

  report += linkVariables;

  return report;
}
