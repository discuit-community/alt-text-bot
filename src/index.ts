import type {
  Post,
  Image,
  APIError,
  Community,
  Comment,
} from "@discuit-community/types";
import { loadConfig } from "./utils/config";
import { DiscuitBot } from "./discuit";
import { LlmService } from "./llm";
import { CommentModel, PostModel } from "@discuit-community/client";
import log from "./utils/log";
import ascii from "./utils/ascii";
import checkConsent from "./utils/permissions";

const DEV_MODE = Bun.env.NODE_ENV === "development";

async function main() {
  try {
    const config = loadConfig();
    const altTextDelayMs = config.altTextDelayMs ?? 180_000;

    const llm = new LlmService(config);
    const bot = new DiscuitBot(config);

    const [loginResult, loginError] = await bot.login();
    if (loginError) {
      const errorInfo = {
        error: loginError.message || String(loginError),
        code: loginError.code?.toString() || "unknown",
      };

      log("failed to log in", errorInfo, {
        logLevel: "error",
        trailingNewline: true,
      });
      return;
    }

    console.log(`logged in as @${loginResult.username}`);

    const handleNewImagePost = async (
      _post: Post,
      images: Image[],
      _comment?: Comment,
    ) => {
      if (!_comment)
        await new Promise((res) => setTimeout(res, altTextDelayMs));

      const post = new PostModel(bot.getClient, _post);
      const comment = _comment
        ? new CommentModel(bot.getClient, _comment)
        : null;

      if (!_comment) {
        const [comments, commentsError] = await post.getComments();

        if (commentsError) {
          log(
            "failed to get comments",
            { postId: post.raw.publicId },
            {
              logLevel: "error",
            },
          );
          return;
        }

        const hasAltText = comments
          ? comments.some((c: CommentModel) =>
              /alt.?text|description|image description/i.test(c.raw.body),
            )
          : false;

        if (hasAltText) {
          log("alt text already provided by user", {
            postId: post.raw.publicId,
          });
          return;
        }
      }

      const genId = Math.random().toString(36).substring(2, 15);
      const gidText = ascii.dim(`[${genId}]`);
      log("new image post", {
        username: post.raw.username,
        title: post.raw.title,
        community: post.raw.communityName,
        url: post.url,
        genId,
      });

      if (DEV_MODE && post.raw.username !== config.discuit.username) return;

      // TODO: Use getCommunity method on DiscuitClient when available
      const communityResult = await fetch(
        `https://discuit.org/api/communities/${post.raw.communityName}?byName=true`,
      );
      const community = (await communityResult.json()) as
        | APIError
        | Community
        | null;

      if (!community) {
        log("community not found", {
          communityName: post.raw.communityName,
        });
        return;
      }
      if ("status" in community) {
        log("error fetching community", {
          status: String(community.status),
          message: community.message,
          code: community.code ? String(community.code) : "undefined",
        });
        return;
      }

      if (!post.raw.author || !community) {
        log("missing author or community", {
          user: post.raw.author ? post.raw.author.username : "unknown",
          communityName: community ? community.name : "unknown",
        });
        return;
      }

      const consent = DEV_MODE
        ? { user: true, community: true }
        : checkConsent(post.raw.author, community);

      log(`consent check: (u:${consent.user} c:${consent.community})`, {
        username: post.raw.username,
        communityName: post.raw.communityName,
        userConsent: consent.user ? "yes" : "no",
        communityConsent: consent.community ? "yes" : "no",
      });

      if (comment && !consent.user) {
        await comment.reply(
          `@${post.raw.username} has not opted into alt text generation.`,
        );
        return;
      }

      if (!comment && (!consent.community || !consent.user)) {
        return;
      }

      try {
        const descriptions = await Promise.all(
          images.map(async (image, index) => {
            const result = await llm.analyzeImage(
              image,
              `${genId}-${index}`,
              post.raw,
              community,
            );
            return result.altText;
          }),
        );

        const plural = images.length > 1;
        const altTextLink =
          "[what is alt text?](https://www.perkins.org/resource/how-write-alt-text-and-image-descriptions-visually-impaired/)";
        const consentUrl =
          "https://github.com/discuit-community/alt-text-bot/blob/main/CONSENT.md";

        const replyBody = {
          header: `**alt text for ${plural ? "these" : "this"} image${plural ? "s" : ""}:**`,
          body: descriptions
            .map(
              (text, index) => `- **image ${index + 1} description:** ${text}`,
            )
            .join("\n"),
          footer:
            "------\n\n" +
            "i am a bot, and this action was performed automatically. " +
            "image descriptions were generated by a large language model. " +
            `want to opt out? see [here](${consentUrl}).`,
          opNotice:
            "------\n\n" +
            `@${post.raw.username}, consider adding alt text to your future ` +
            `posts to make them more accessible! ${altTextLink}`,
        };

        const [_commentResult, _commentError] = await post.comment({
          body: Object.values(replyBody).join("\n\n"),
        });

        if (_commentError)
          console.error(`${gidText} error posting comment:`, _commentError);
        else console.log(`${gidText} posted comment successfully`);
      } catch (error) {
        console.error(`${gidText} error processing post:`, error);
      }
    };

    await bot.startMonitoring(handleNewImagePost);
  } catch (error) {
    console.error("an error occurred:", error);
    process.exit(1);
  }
}

main().catch(console.error);
