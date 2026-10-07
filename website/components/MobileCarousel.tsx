"use client";

import { Children, useEffect, useRef, useState } from "react";

/**
 * Desktop/tablet (md and up): renders children inside the grid you pass via `className` (nothing changes).
 * Phones (below md): turns the same children into a swipeable, snap-scrolling row with dot indicators.
 */
export default function MobileCarousel({
  children,
  className = "",
  itemClass = "max-md:w-[84%]",
  scrollerClass = "",
  dots = true,
}: {
  children: React.ReactNode;
  className?: string;      // desktop grid classes, e.g. "md:grid md:grid-cols-3 md:gap-7"
  itemClass?: string;      // mobile card width, e.g. "max-md:w-[84%]"
  scrollerClass?: string;  // extra mobile-only classes, e.g. "max-md:pt-9"
  dots?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = Children.toArray(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      const left = el.scrollLeft;
      let best = 0, bestD = Infinity;
      kids.forEach((k, i) => {
        const d = Math.abs(k.offsetLeft - el.offsetLeft - 20 - left);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (left + el.clientWidth >= el.scrollWidth - 4) best = kids.length - 1;
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  return (
    <div>
      <div
        ref={ref}
        className={`no-scrollbar max-md:-mx-5 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:gap-3.5 max-md:overflow-x-auto max-md:scroll-px-5 max-md:px-5 max-md:pb-3 ${scrollerClass} ${className}`}
      >
        {items.map((child, i) => (
          <div
            key={i}
            className={`max-md:flex max-md:shrink-0 max-md:snap-start max-md:[&>*]:w-full md:contents ${itemClass}`}
          >
            {child}
          </div>
        ))}
      </div>
      {dots && items.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
          {items.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-signal" : "w-1.5 bg-line"}`} />
          ))}
        </div>
      )}
    </div>
  );
}