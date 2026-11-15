"use client";

import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface AnnouncementView {
  id: string;
  text: string;
  href: string | null;
  tone: "primary" | "accent" | "neutral";
}

const TONES: Record<AnnouncementView["tone"], string> = {
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent text-accent-foreground",
  neutral: "bg-secondary text-secondary-foreground",
};

/**
 * The messages above the header, one at a time. They change every six
 * seconds, pause while hovered or focused, and stand still for visitors who
 * ask for reduced motion. The side slot (track order, language) stays put.
 */
export function AnnouncementBar({
  messages,
  children,
}: {
  messages: readonly AnnouncementView[];
  children?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (messages.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % messages.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [messages.length, paused]);

  const current = messages[index % Math.max(1, messages.length)];
  const tone = current?.tone ?? "primary";

  return (
    <div
      className={cn(TONES[tone], "transition-colors")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      data-testid="announcement-bar"
    >
      <div className="site-container flex h-9 items-center justify-between gap-4 text-xs">
        <p className="truncate">
          {current === undefined ? null : current.href === null ? (
            current.text
          ) : (
            <Link href={current.href} className="hover:underline hover:underline-offset-4">
              {current.text}
            </Link>
          )}
        </p>
        {children === undefined ? null : (
          <div className="flex shrink-0 items-center gap-4">{children}</div>
        )}
      </div>
    </div>
  );
}
