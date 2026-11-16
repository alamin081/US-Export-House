/**
 * Terminal prompts for operator scripts. `askHidden` reads a line in raw mode
 * and never echoes it, so a password is not shown on screen, not passed as a
 * command-line argument and not written to shell history. It refuses to run
 * without a real terminal (stdin piped from a file or another program).
 */
import { createInterface } from "node:readline/promises";

const ENTER = new Set(["\r", "\n", "\u0004"]);
const CTRL_C = "\u0003";
const BACKSPACE = new Set(["\u0008", "\u007f"]);

export class PromptCancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "PromptCancelled";
  }
}

export function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/** Applies one keypress chunk to a hidden buffer; pure, for the unit tests. */
export function applyHiddenInput(
  buffer: string,
  chunk: string,
): { buffer: string; done: boolean; cancelled: boolean } {
  let current = buffer;
  const chars = [...chunk];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] ?? "";
    if (char === CTRL_C) return { buffer: "", done: false, cancelled: true };
    if (ENTER.has(char)) return { buffer: current, done: true, cancelled: false };
    if (BACKSPACE.has(char)) {
      current = [...current].slice(0, -1).join("");
      continue;
    }
    if (char === "\u001b") {
      // Skip a whole escape sequence (arrow keys: ESC [ A), so it can never
      // end up inside the password unseen.
      if (chars[i + 1] === "[" || chars[i + 1] === "O") {
        i += 2;
        while (i < chars.length && !/[A-Za-z~]/.test(chars[i] ?? "")) i += 1;
      }
      continue;
    }
    if (char < " " || char === "\u007f") continue;
    current += char;
  }
  return { buffer: current, done: false, cancelled: false };
}

export function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.reject(new Error("Hidden input needs an interactive terminal."));

  process.stdout.write(question);
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const wasRaw = stdin.isRaw;
    const finish = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (data: Buffer) => {
      const step = applyHiddenInput(buffer, data.toString("utf8"));
      buffer = step.buffer;
      if (step.cancelled) {
        finish();
        reject(new PromptCancelled());
      } else if (step.done) {
        finish();
        const value = buffer;
        buffer = "";
        resolve(value);
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
