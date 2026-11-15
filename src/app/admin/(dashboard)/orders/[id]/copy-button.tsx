"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies text (an address or phone) for pasting into a courier's form. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ms-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted-foreground normal-case hover:text-foreground"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
