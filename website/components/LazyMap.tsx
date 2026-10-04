"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/** Loads the (heavy) Google map only when it scrolls into view, so the page itself loads fast. */
export default function LazyMap({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null); const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || !("IntersectionObserver" in window)) { setShow(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-full min-h-[22rem] w-full bg-cream">
      {show ? <iframe title={title} src={src} className="h-full min-h-[22rem] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        : <div className="flex h-full min-h-[22rem] items-center justify-center text-smoke"><Icon name="pin" size={28} /></div>}
    </div>
  );
}
