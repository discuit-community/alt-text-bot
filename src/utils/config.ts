import { readFileSync } from "fs";
import { join } from "path";

export interface Config {
  discuit: {
    baseUrl: string;
    username: string;
    password: string;
  };
  ai: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  altTextDelayMs?: number;
}

export function loadConfig(): Config {
  try {
    const configPath = join(process.cwd(), ".altbotrc.json");
    const configFile = readFileSync(configPath, "utf-8");
    return JSON.parse(configFile);
  } catch (error) {
    console.error("failed to load config file:");
    console.error(error);
    throw new Error(
      "could not load configuration. please create a .altbotrc.json file.",
    );
  }
}
