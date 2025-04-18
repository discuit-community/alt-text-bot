import { Database } from "bun:sqlite";
import type { Post } from "@discuit-community/types";
import log from "../utils/log";

type UsageStats = {
  userCount: number;
  communityCount: number;
  imagePostsWithAltByHumans: number;
  imagePostsWithAltByBot: number;
  totalImagePosts: number;
};

export class AltTextTracker {
  private db: Database;
  private initialized = false;

  constructor(dbPath: string = "alttext_stats.sqlite") {
    this.db = new Database(dbPath, { create: true });
    log("tracker initialized", { dbPath });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.db.run(`
        CREATE TABLE IF NOT EXISTS image_posts (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          community TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          has_alt_text INTEGER DEFAULT 0,
          alt_text_by TEXT DEFAULT NULL,
          alt_text_added_at INTEGER DEFAULT NULL
        )
      `);

    this.db.run(`
        CREATE TABLE IF NOT EXISTS communities (
          name TEXT PRIMARY KEY,
          tracked_since INTEGER NOT NULL
        )
      `);

    this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          username TEXT PRIMARY KEY,
          tracked_since INTEGER NOT NULL
        )
      `);

    this.db.run(`
        CREATE TABLE IF NOT EXISTS weekly_reports (
          week_start INTEGER PRIMARY KEY,
          stats TEXT NOT NULL
        )
      `);

    this.initialized = true;
    console.log("tracker database initialized");
  }

  trackImagePost(post: Post): void {
    const stmt = this.db.query(`
        INSERT OR IGNORE INTO image_posts
        (id, username, community, created_at)
        VALUES ($id, $username, $community, $created_at)
      `);

    stmt.run({
      $id: post.publicId,
      $username: post.username,
      $community: post.communityName,
      $created_at: Math.floor(Date.now() / 1000),
    });

    this.trackUser(post.username);
    this.trackCommunity(post.communityName);
  }

  trackAltTextAdded(
    postId: string,
    addedBy: string,
    isBot: boolean = false,
  ): void {
    const stmt = this.db.query(`
        UPDATE image_posts
        SET has_alt_text = 1,
            alt_text_by = $added_by,
            alt_text_added_at = $added_at
        WHERE id = $id AND has_alt_text = 0
      `);

    stmt.all({
      $id: postId,
      $added_by: isBot ? "bot" : addedBy,
      $added_at: Math.floor(Date.now() / 1000),
    });
  }

  trackUser(username: string): void {
    const stmt = this.db.query(`
        INSERT OR IGNORE INTO users
        (username, tracked_since)
        VALUES ($username, $tracked_since)
      `);

    stmt.run({
      $username: username,
      $tracked_since: Math.floor(Date.now() / 1000),
    });
  }

  trackCommunity(name: string): void {
    const stmt = this.db.query(`
        INSERT OR IGNORE INTO communities
        (name, tracked_since)
        VALUES ($name, $tracked_since)
      `);

    stmt.run({
      $name: name,
      $tracked_since: Math.floor(Date.now() / 1000),
    });
  }

  getTopUsersByAltTextPercentage(limit: number = 5): Array<{
    username: string;
    percentage: number;
    count: number;
    total: number;
  }> {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    return this.db
      .query(
        `
        WITH user_stats AS (
          SELECT
            username,
            COUNT(*) AS total_posts,
            SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS alt_text_posts
          FROM image_posts
          WHERE created_at >= $one_week_ago
          GROUP BY username
          HAVING total_posts >= 3
        )
        SELECT
          username,
          CAST(alt_text_posts AS FLOAT) / total_posts * 100 AS percentage,
          alt_text_posts AS count,
          total_posts AS total
        FROM user_stats
        ORDER BY percentage DESC, total_posts DESC
        LIMIT $limit
      `,
      )
      .all({
        $one_week_ago: oneWeekAgo,
        $limit: limit,
      }) as Array<{
      username: string;
      percentage: number;
      count: number;
      total: number;
    }>;
  }

  getTopCommunitiesByAltTextPercentage(limit: number = 5): Array<{
    community: string;
    percentage: number;
    count: number;
    total: number;
  }> {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    return this.db
      .query(
        `
        WITH community_stats AS (
          SELECT
            community,
            COUNT(*) AS total_posts,
            SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS alt_text_posts
          FROM image_posts
          WHERE created_at >= $one_week_ago
          GROUP BY community
          HAVING total_posts >= 5
        )
        SELECT
          community,
          CAST(alt_text_posts AS FLOAT) / total_posts * 100 AS percentage,
          alt_text_posts AS count,
          total_posts AS total
        FROM community_stats
        ORDER BY percentage DESC, total_posts DESC
        LIMIT $limit
      `,
      )
      .all({
        $one_week_ago: oneWeekAgo,
        $limit: limit,
      }) as Array<{
      community: string;
      percentage: number;
      count: number;
      total: number;
    }>;
  }

  getMostImprovedUsers(
    limit: number = 5,
  ): Array<{ username: string; previous: number; current: number }> {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;

    return this.db
      .query(
        `
        WITH previous_week AS (
          SELECT
            username,
            CAST(SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS percentage
          FROM image_posts
          WHERE created_at >= $two_weeks_ago AND created_at < $one_week_ago
          GROUP BY username
          HAVING COUNT(*) >= 3
        ),
        current_week AS (
          SELECT
            username,
            CAST(SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS percentage
          FROM image_posts
          WHERE created_at >= $one_week_ago
          GROUP BY username
          HAVING COUNT(*) >= 3
        )
        SELECT
          c.username,
          COALESCE(p.percentage, 0) AS previous,
          c.percentage AS current
        FROM current_week c
        LEFT JOIN previous_week p ON c.username = p.username
        WHERE c.percentage > COALESCE(p.percentage, 0)
        ORDER BY (c.percentage - COALESCE(p.percentage, 0)) DESC
        LIMIT $limit
      `,
      )
      .all({
        $one_week_ago: oneWeekAgo,
        $two_weeks_ago: twoWeeksAgo,
        $limit: limit,
      }) as Array<{ username: string; previous: number; current: number }>;
  }

  getMostImprovedCommunities(
    limit: number = 5,
  ): Array<{ community: string; previous: number; current: number }> {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;

    return this.db
      .query(
        `
        WITH previous_week AS (
          SELECT
            community,
            CAST(SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS percentage
          FROM image_posts
          WHERE created_at >= $two_weeks_ago AND created_at < $one_week_ago
          GROUP BY community
          HAVING COUNT(*) >= 5
        ),
        current_week AS (
          SELECT
            community,
            CAST(SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS percentage
          FROM image_posts
          WHERE created_at >= $one_week_ago
          GROUP BY community
          HAVING COUNT(*) >= 5
        )
        SELECT
          c.community,
          COALESCE(p.percentage, 0) AS previous,
          c.percentage AS current
        FROM current_week c
        LEFT JOIN previous_week p ON c.community = p.community
        WHERE c.percentage > COALESCE(p.percentage, 0)
        ORDER BY (c.percentage - COALESCE(p.percentage, 0)) DESC
        LIMIT $limit
      `,
      )
      .all({
        $one_week_ago: oneWeekAgo,
        $two_weeks_ago: twoWeeksAgo,
        $limit: limit,
      }) as Array<{ community: string; previous: number; current: number }>;
  }

  getTotals(): UsageStats {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    const result = this.db
      .query(
        `
        SELECT
          COUNT(DISTINCT username) as userCount,
          COUNT(DISTINCT community) as communityCount,
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by != 'bot' THEN 1 ELSE 0 END) as imagePostsWithAltByHumans,
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by = 'bot' THEN 1 ELSE 0 END) as imagePostsWithAltByBot,
          COUNT(*) as totalImagePosts
        FROM image_posts
        WHERE created_at >= $one_week_ago
      `,
      )
      .get({
        $one_week_ago: oneWeekAgo,
      }) as UsageStats;

    return result;
  }

  saveWeeklyReport(stats: any): void {
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    this.db
      .query(
        `
        INSERT OR REPLACE INTO weekly_reports
        (week_start, stats)
        VALUES ($week_start, $stats)
      `,
      )
      .run({
        $week_start: weekStart,
        $stats: JSON.stringify(stats),
      });
  }
}
