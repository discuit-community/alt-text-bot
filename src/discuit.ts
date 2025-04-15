import {
  DiscuitClient,
  PostModel,
  type Result,
} from "@discuit-community/client";
import { Jetstream, Topic } from "@discuit-community/jetstream";
import type { Post, Image, User } from "@discuit-community/types";
import log from "./utils/log";

import { type Config, loadConfig } from "./utils/config";

const config = loadConfig();

export class DiscuitBot {
  private client: DiscuitClient;
  private jetstream: Jetstream | null = null;

  constructor(config: Config) {
    this.client = new DiscuitClient({
      baseUrl: config.discuit.baseUrl,
    });

    log(
      "discuitbot initialized",
      {
        baseUrl: config.discuit.baseUrl,
      },
      { trailingNewline: false },
    );
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
    onNewImagePost: (post: Post, images: Image[]) => Promise<void>,
  ) {
    const pollingInterval =
      process.env.NODE_ENV === "production" ? 10000 : 1000;
    this.jetstream = new Jetstream({
      client: this.client,
      pollingInterval,
    });

    log("polling new posts", {
      interval: String(pollingInterval),
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
    });

    const server = await this.jetstream.start();

    server.on(Topic.NEW_POST, async (message: Post) => {
      const post = new PostModel(this.client, message);
      if (post.raw.type === "image") {
        const images = post.raw.images;
        await onNewImagePost(post.raw, images);
      }
    });

    await this.jetstream.start();
  }
}
