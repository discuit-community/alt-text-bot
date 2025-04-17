import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

import { type Config } from "./utils/config";
import type { ImageAnalysisResult } from "./types";
import type { Community, Image, Post } from "@discuit-community/types";

import log from "./utils/log";
import ascii from "./utils/ascii";

function fillPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] ?? "");
}

const systemTemplate = readFileSync(
  join(import.meta.dir, "../prompts/system.txt"),
  "utf8",
);

const userPrompt = readFileSync(
  join(import.meta.dir, "../prompts/user.txt"),
  "utf8",
);

export class LlmService {
  private openai: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.openai = new OpenAI({
      baseURL: config.ai.baseUrl,
      apiKey: config.ai.apiKey,
    });
    this.model = config.ai.model;

    const apiKey = {
      first: config.ai.apiKey.substring(0, 5),
      last: config.ai.apiKey.substring(config.ai.apiKey.length - 5),
    };
    const apiKeyMasked = `${apiKey.first}…${apiKey.last}`;

    log("llm service initialized", {
      baseUrl: config.ai.baseUrl,
      model: this.model,
      apiKey: apiKeyMasked,
    });
  }

  private async imageToBase64(imageUrl: string): Promise<string> {
    try {
      const url = imageUrl.startsWith("http")
        ? imageUrl
        : `https://discuit.org${imageUrl}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const dataUri = `data:${contentType};base64,${base64}`;

      return dataUri;
    } catch (error) {
      console.error("error converting image to base64:", error);
      throw error;
    }
  }

  async analyzeImage(
    image: Image,
    genId: string,
    post: Post,
    community: Community,
  ): Promise<ImageAnalysisResult> {
    const gidText = ascii.dim(`[${genId}]`);

    try {
      console.log(`${gidText} converting image to base64...`);
      const imageDataUri = await this.imageToBase64(image.url);

      const systemPrompt = fillPrompt(systemTemplate, {
        community: post.communityName,
        communityDescription: community.about ?? "no description available",
        title: post.title,
      });

      console.log(`${gidText} sending request to llm provider...`);
      const response = await this.openai.chat.completions.create({
        model: this.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              { type: "image_url", image_url: { url: imageDataUri } },
            ],
          },
        ],
      });

      console.log(`${gidText} received response from llm provider!`);
      const altText =
        response.choices[0]?.message?.content ||
        "image description not available.";

      return {
        altText,
      };
    } catch (error) {
      console.error(`${gidText} error analyzing image:`, error);
      return {
        altText: "unable to generate image description.",
      };
    }
  }
}
