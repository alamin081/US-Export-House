"use client";

import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface HeroSlideView {
  id: string;
  desktop: string;
  mobile: string | null;
  alt: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  textTone: "dark" | "light";
  buttons: Array<{ label: string; href: string; primary: boolean }>;
}

/**
 * Home hero: one or more slides with separate desktop (16:7) and mobile (4:5)
 * pictures. Several slides change every seven seconds, pause on hover or
 * focus, and stay still for visitors who prefer reduced motion; the dots
 * let anyone move between them.
 */
export function HeroSlides({ slides }: { slides: readonly HeroSlideView[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % slides.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  return (
    <section
      className="relative border-b border-border"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      data-testid="home-hero"
    >
      {slides.map((slide, slideIndex) => (
        <div
          key={slide.id}
          className={cn("relative", slideIndex === index ? "block" : "hidden")}
          aria-roledescription="slide"
          aria-label={`${slideIndex + 1} / ${slides.length}`}
        >
          <picture>
            {slide.mobile === null ? null : (
              <source media="(max-width: 767px)" srcSet={slide.mobile} />
            )}
            <img
              src={slide.desktop}
              alt={slide.alt}
              className="aspect-[4/5] w-full object-cover md:aspect-[16/7]"
              fetchPriority={slideIndex === 0 ? "high" : "auto"}
              loading={slideIndex === 0 ? "eager" : "lazy"}
            />
          </picture>
          <div
            className={cn(
              "absolute inset-0 flex items-end md:items-center",
              slide.textTone === "light" ? "text-white" : "text-foreground",
            )}
          >
            <div className="site-container pb-10 md:pb-0">
              <div className="max-w-lg">
                {slide.eyebrow === "" ? null : (
                  <p className="text-xs font-medium tracking-[0.22em] uppercase opacity-80">
                    {slide.eyebrow}
                  </p>
                )}
                <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                  {slide.title}
                </h1>
                {slide.subtitle === "" ? null : (
                  <p className="mt-4 text-base leading-relaxed opacity-90">{slide.subtitle}</p>
                )}
                {slide.buttons.length === 0 ? null : (
                  <div className="mt-7 flex flex-wrap gap-3">
                    {slide.buttons.map((button) => (
                      <Link
                        key={button.href + button.label}
                        href={button.href}
                        className={buttonVariants({
                          size: "lg",
                          variant: button.primary ? "primary" : "outline",
                        })}
                      >
                        {button.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      {slides.length < 2 ? null : (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(slideIndex)}
              aria-label={`${slideIndex + 1} / ${slides.length}`}
              aria-current={slideIndex === index}
              className={cn(
                "size-2.5 rounded-full border border-white/80",
                slideIndex === index ? "bg-white" : "bg-white/30",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
