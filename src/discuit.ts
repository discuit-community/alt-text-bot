import {
  CommentModel,
  DiscuitClient,
  PostModel,
  type Result,
} from "@discuit-community/client";
import { Jetstream, Topic } from "@discuit-community/jetstream";
import type { Comment, Post, Image, User } from "@discuit-community/types";
import type { APIError } from "openai";

import { type Config, loadConfig } from "./utils/config";
import log from "./utils/log";

const config = loadConfig();

export class DiscuitBot {
  private client: DiscuitClient;
  private jetstream: Jetstream | null = null;

  constructor(config: Config) {
    this.client = new DiscuitClient({
      baseUrl: config.discuit.baseUrl,
    });

    log("discuitbot initialized", {
      baseUrl: config.discuit.baseUrl,
    });
  }

  get getClient() {
    return this.client;
  }

  async login(): Promise<Result<User>> {
    await this.client.initialize();
    return this.client.login({
      username: config.discuit.username,
      password: config.discuit.password,
    });
  }

  async startMonitoring(
    onNewImagePost: (_post: Post) => Promise<void>,
    onNewComment: (_post: Post, _comment: Comment) => Promise<void>,
  ) {
    const pollingInterval =
      process.env.NODE_ENV === "production" ? 10000 : 1000;
    this.jetstream = new Jetstream({
      client: this.client,
      pollingInterval,
      commentPollingInterval: pollingInterval,
    });

    log("polling new posts", {
      interval: String(pollingInterval),
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
    });

    const server = await this.jetstream.start();

    server.on(Topic.NEW_POST, async (message: Post) => {
      const post = new PostModel(this.client, message);
      if (post.raw.type === "image") await onNewImagePost(post.raw);
    });

    server.on(Topic.NEW_COMMENT, async (comment: Comment) => {
      if (
        !comment.body.includes(config.discuit.username) &&
        !/alt.?text|description|image description/i.test(comment.body)
      )
        return;

      if (comment.username === config.discuit.username) return;

      const postId = comment.postPublicId;

      const postResult = await fetch(`https://discuit.org/api/posts/${postId}`);
      const post = (await postResult.json()) as APIError | Post | null;

      if (!post) {
        log("post not found", { postId });
        return;
      }

      if ("status" in post) {
        log("error fetching post", {
          status: String(post.status),
          message: post.message,
          code: post.code ? String(post.code) : "undefined",
        });
        return;
      }

      if (post.type === "image") await onNewComment(post, comment);
    });
  }
}
