import DiscuitClient, {
  type PostModel,
  type CommentModel,
} from "@discuit-community/client";
import fs from "node:fs";
import { AltTextTracker } from "../src/roundup/tracker";
import { generateWeeklyReport } from "../src/roundup/reports";
import ascii from "../src/utils/ascii";

type AltTextStatus = { post: PostModel; comment: CommentModel | null };
type AltTextStats = { total: number; manual: number; automated: number };

const ALT_TEXT_REGEX = /alt.?text|description|image description/i;
const truncate = (s: string, len = 25) =>
  s.length > len ? `${s.substring(0, len)}...` : s;
const alt = (text: string) => ALT_TEXT_REGEX.test(text);

function parseDate(str: string | undefined, fallback: Date): Date {
  if (!str) return fallback;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function parseIntOr(str: string | undefined, fallback: number): number {
  const n = Number.parseInt(str ?? "");
  return Number.isNaN(n) ? fallback : n;
}

const args = process.argv.slice(2);
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const START_DATE = parseDate(args[0], yesterday);
const END_DATE = parseDate(args[1], now);
const MAX_POSTS = parseIntOr(args[2], 500);

async function printSummary(total: number, withAlt: AltTextStats) {
  const percent = (withAlt.total / total) * 100;
  const percentColor =
    percent > 50 ? ascii.green : percent > 25 ? ascii.yellow : ascii.red;

  console.log(ascii.cyan("\n─── summary ───"));
  console.log(`${ascii.green("✔")} ${withAlt.total} posts with alt text`);
  console.log(`  ├─ ${withAlt.automated} automated (alttextbot)`);
  console.log(`  └─ ${withAlt.manual} manual`);
  console.log(`${ascii.red("✘")} ${total - withAlt.total} missing alt text`);
  console.log(`\n  ${percentColor(`${Math.round(percent)}%`)} accessible!`);
}

async function processPosts(
  tracker: AltTextTracker,
  posts: PostModel[],
  allPosts: AltTextStatus[],
  stats: AltTextStats,
) {
  let batchTotal = 0;
  let batchManual = 0;
  let batchAutomated = 0;

  const logProcessing = (message: string) => {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${message}`);
  };

  await Promise.all(
    posts.map(async (post) => {
      tracker.trackImagePost(post.raw);

      const [comments, error] = await post.getComments();
      if (error) {
        console.error(error);
        return null;
      }

      const username = String(post.raw.username).trim();
      const altComment = comments.find((comment) => alt(comment.raw.body));
      const hasAltTextInImages = post.raw.images.some(
        (img) => img.altText != null,
      );

      const escapeStr = (str: string) =>
        str.replace(/[\\_\x00-\x1f\x7f-\x9f]/g, (ch) => "");
      const title = truncate(escapeStr(post.raw.title));
      const dateStr = new Date(post.raw.createdAt)
        .toLocaleString()
        .padStart(24, " ");

      if (altComment || hasAltTextInImages) {
        const key = altComment
          ? altComment.raw.username === "alttextbot"
            ? "automated"
            : "manual"
          : "manual";

        const username = altComment
          ? altComment.raw.username
          : post.raw.username;
        const timestamp = altComment
          ? new Date(altComment.raw.createdAt)
          : new Date(post.raw.createdAt);

        logProcessing(
          `${dateStr} | ${ascii.green("✔")} "${title}" by @${username}`,
        );
        stats.total++;
        stats[key]++;
        batchTotal++;
        if (key === "manual") {
          batchManual++;
          tracker.trackAltTextAdded(
            post.raw.publicId,
            username,
            new Date(timestamp),
          );
        } else {
          batchAutomated++;
          tracker.trackAltTextAdded(
            post.raw.publicId,
            "alttextbot",
            new Date(timestamp),
          );
        }
        allPosts.push({ post, comment: altComment || null });
      } else {
        logProcessing(
          `${dateStr} | ${ascii.red("✘")} "${title}" by @${username}`,
        );
        batchTotal++;
        allPosts.push({ post, comment: null });
      }
    }),
  );

  const dateStr = new Date().toLocaleString().padStart(24, " ");
  const percentageDescribed = (
    ((batchManual + batchAutomated) / batchTotal) *
    100
  ).toFixed(2);
  const percentageAutomated = ((batchAutomated / batchTotal) * 100).toFixed(2);

  logProcessing(
    `${dateStr} | ${ascii.green("✔")} ${percentageDescribed}% of posts have alt text (${percentageAutomated}% automated)`,
  );
}

async function main() {
  console.log(
    `scanning posts from ${START_DATE.toISOString()} to ${END_DATE.toISOString()}...`,
  );
  const client = new DiscuitClient();
  const tracker = new AltTextTracker();
  await tracker.initialize();

  const posts: AltTextStatus[] = [];
  const withAlt: AltTextStats = { total: 0, manual: 0, automated: 0 };

  let cursor: string | undefined;
  let keepGoing = true;

  while (keepGoing && posts.length < MAX_POSTS) {
    const [result, error] = await client.getPosts({
      sort: "latest",
      limit: 50,
      next: cursor,
    });

    if (error) {
      console.error(error);
      break;
    }

    const imagePosts = result.posts.filter((post) => {
      if (post.raw.type !== "image") return false;
      const postDate = new Date(post.raw.createdAt);
      return postDate >= START_DATE && postDate <= END_DATE;
    });

    await processPosts(tracker, imagePosts, posts, withAlt);
    console.log();

    const oldest = result.posts[result.posts.length - 1];
    if (!oldest) break;

    const oldestDate = new Date(oldest.raw.createdAt);
    if (oldestDate < START_DATE) keepGoing = false;

    if (!result.next) break;
    cursor = result.next;
  }

  console.log("processing complete.");
  await printSummary(posts.length, withAlt);

  const report = await generateWeeklyReport(tracker);
  await fs.promises.writeFile("ROUNDUP.md", report);
}

void main().catch((error) => {
  console.error(error);
});
