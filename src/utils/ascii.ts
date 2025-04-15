export default {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  underline: (text: string) => `\x1b[4m${text}\x1b[24m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,
};
