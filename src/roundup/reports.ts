import type { AltTextTracker } from "./tracker";

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
  const dateRange = `${dateFormat.format(startDate)} - ${dateFormat.format(endDate)}`;

  const topUsers = tracker.getTopUsersByAltTextPercentage(5);
  const topCommunities = tracker.getTopCommunitiesByAltTextPercentage(5);
  const mostImprovedUsers = tracker.getMostImprovedUsers(3);
  const mostImprovedCommunities = tracker.getMostImprovedCommunities(3);
  const totals = tracker.getTotals();

  const formatPercentage = (value: number) => `${Math.round(value)}%`;

  // TODO
  const report = "TODO.";

  tracker.saveWeeklyReport({
    dateRange,
    topUsers,
    topCommunities,
    mostImprovedUsers,
    mostImprovedCommunities,
    totals,
  });

  return report;
}
