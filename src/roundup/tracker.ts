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

export interface PostStats {
  id: string;
  username: string;
  community: string;
  created_at: number;
  has_alt_text: number;
  alt_text_by: string | null;
  alt_text_added_at: number | null;
}

export interface TrackerStats {
  totalPosts: number;
  postsWithAltText: number;
  postsWithoutAltText: number;
  userStats: {
    totalUsers: number;
    topContributors: Array<{
      username: string;
      percentage: number;
      count: number;
      total: number;
    }>;
  };
  communityStats: {
    totalCommunities: number;
    topCommunities: Array<{
      community: string;
      percentage: number;
      count: number;
      total: number;
    }>;
  };
}

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

    const postCreatedAt = new Date(post.createdAt);
    stmt.run({
      $id: post.publicId,
      $username: post.username,
      $community: post.communityName,
      $created_at: postCreatedAt.getTime(),
    });

    this.trackUser(post.username);
    this.trackCommunity(post.communityName);
  }

  trackAltTextAdded(
    postId: string,
    addedBy: string,
    time: Date,
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
      $added_at: time.getTime(),
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
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by != 'alttextbot' THEN 1 ELSE 0 END) as imagePostsWithAltByHumans,
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by = 'alttextbot' THEN 1 ELSE 0 END) as imagePostsWithAltByBot,
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

  getTotalsForRange(start: Date, end: Date): UsageStats {
    const startTs = Math.floor(start.getTime());
    const endTs = Math.floor(end.getTime());

    const result = this.db
      .query(
        `
        SELECT
          COUNT(DISTINCT username) as userCount,
          COUNT(DISTINCT community) as communityCount,
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by != 'alttextbot' THEN 1 ELSE 0 END) as imagePostsWithAltByHumans,
          SUM(CASE WHEN has_alt_text = 1 AND alt_text_by = 'alttextbot' THEN 1 ELSE 0 END) as imagePostsWithAltByBot,
          COUNT(*) as totalImagePosts
        FROM image_posts
        WHERE created_at >= $start AND created_at < $end
      `,
      )
      .get({
        $start: startTs,
        $end: endTs,
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

  // API support methods
  async getStats(): Promise<TrackerStats> {
    const topUsers = this.getTopUsersByAltTextPercentage(10);
    const topCommunities = this.getTopCommunitiesByAltTextPercentage(10);

    const postsStatsQuery = this.db.query(`
      SELECT
        COUNT(*) as totalPosts,
        SUM(CASE WHEN has_alt_text = 1 THEN 1 ELSE 0 END) as postsWithAltText,
        SUM(CASE WHEN has_alt_text = 0 THEN 1 ELSE 0 END) as postsWithoutAltText
      FROM image_posts
    `);

    const postsStats = postsStatsQuery.get() as {
      totalPosts: number;
      postsWithAltText: number;
      postsWithoutAltText: number;
    };

    const userCountQuery = this.db.query(`
      SELECT COUNT(*) as totalUsers FROM users
    `);
    const userCount = (userCountQuery.get() as { totalUsers: number })
      .totalUsers;

    const communityCountQuery = this.db.query(`
      SELECT COUNT(*) as totalCommunities FROM communities
    `);
    const communityCount = (
      communityCountQuery.get() as { totalCommunities: number }
    ).totalCommunities;

    return {
      ...postsStats,
      userStats: {
        totalUsers: userCount,
        topContributors: topUsers,
      },
      communityStats: {
        totalCommunities: communityCount,
        topCommunities: topCommunities,
      },
    };
  }

  async getAllPosts(
    limit: number = 100,
    offset: number = 0,
  ): Promise<PostStats[]> {
    const query = this.db.query(`
      SELECT
        id, username, community, created_at,
        has_alt_text, alt_text_by, alt_text_added_at
      FROM image_posts
      ORDER BY created_at DESC
      LIMIT $limit OFFSET $offset
    `);

    return query.all({
      $limit: limit,
      $offset: offset,
    }) as PostStats[];
  }

  async getPostsByUser(
    username: string,
    limit: number = 50,
  ): Promise<PostStats[]> {
    const query = this.db.query(`
      SELECT
        id, username, community, created_at,
        has_alt_text, alt_text_by, alt_text_added_at
      FROM image_posts
      WHERE username = $username
      ORDER BY created_at DESC
      LIMIT $limit
    `);

    return query.all({
      $username: username,
      $limit: limit,
    }) as PostStats[];
  }

  async getPostsByCommunity(
    community: string,
    limit: number = 50,
  ): Promise<PostStats[]> {
    const query = this.db.query(`
      SELECT
        id, username, community, created_at,
        has_alt_text, alt_text_by, alt_text_added_at
      FROM image_posts
      WHERE community = $community
      ORDER BY created_at DESC
      LIMIT $limit
    `);

    return query.all({
      $community: community,
      $limit: limit,
    }) as PostStats[];
  }
}
