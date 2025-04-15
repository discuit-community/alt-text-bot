import ascii from "./ascii";

type LogOptions = {
  trailingNewline: boolean;
  logLevel: "log" | "info" | "warn" | "error";
};

export default (
  title: string,
  rows: Record<string, string>,
  options?: Partial<LogOptions>,
) => {
  const defaultOptions = {
    trailingNewline: true,
    logLevel: "info",
  };
  const mergedOptions = { ...defaultOptions, ...options };
  const { trailingNewline, logLevel } = mergedOptions as LogOptions;

  console[logLevel](ascii.bold(`• ${title}`));

  const longestKey = Object.keys(rows).reduce(
    (max, key) => Math.max(max, key.length),
    0,
  );

  Object.entries(rows).forEach(([key, value]) =>
    console[logLevel](
      `     ${ascii.bold(key.padStart(longestKey))}   ${ascii.dim(value)}`,
    ),
  );

  if (trailingNewline) console.log();
};
