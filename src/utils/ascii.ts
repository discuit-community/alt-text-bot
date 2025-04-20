export default {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  underline: (text: string) => `\x1b[4m${text}\x1b[24m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,

  red: (text: string) => `\x1b[31m${text}\x1b[39m`,
  green: (text: string) => `\x1b[32m${text}\x1b[39m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[39m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[39m`,
};
