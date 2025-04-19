import DiscuitClient, {
  PostModel,
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

const START_DATE = new Date("2025-04-19T01:41:58Z");
const END_DATE = new Date();
const MAX_POSTS = 500;

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

  await Promise.all(
    posts.map(async (post) => {
      tracker.trackImagePost(post.raw);

      const [comments, error] = await post.getComments();
      if (error) {
        console.error(error);
        return null;
      }

      const altComment = comments.find((comment) => alt(comment.raw.body));
      const title = truncate(post.raw.title);
      const dateStr = new Date(post.raw.createdAt).toISOString();

      if (altComment) {
        const key =
          altComment.raw.username === "alttextbot" ? "automated" : "manual";
        process.stdout.write(
          `processing: ${dateStr} | ${ascii.green("✔")} ${title} by ${post.raw.username}${" ".repeat(20)}\r`,
        );
        stats.total++;
        stats[key]++;
        batchTotal++;
        if (key === "manual") {
          batchManual++;
          tracker.trackAltTextAdded(post.raw.publicId, altComment.raw.username);
        } else {
          batchAutomated++;
          tracker.trackAltTextAdded(post.raw.publicId, "alttextbot");
        }
        allPosts.push({ post, comment: altComment });
      } else {
        process.stdout.write(
          `processing: ${dateStr} | ${ascii.red("✘")} ${title} by ${post.raw.username}${" ".repeat(20)}\r`,
        );
        batchTotal++;
        allPosts.push({ post, comment: null });
      }
    }),
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
