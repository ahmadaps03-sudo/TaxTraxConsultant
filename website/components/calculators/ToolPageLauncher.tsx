"use client";
import { useEffect } from "react";
import ToolGrid from "./ToolGrid";
import { useCalculator } from "./CalculatorProvider";
import type { CalcId } from "@/lib/calc-meta";

/** Old per-tool URLs (kept for SEO and bookmarks) show the tools page with that calculator popped up. */
export default function ToolPageLauncher({ id }: { id: CalcId }) {
  const { open } = useCalculator();
  useEffect(() => { open(id); }, [id, open]);
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-12">
      <h1 className="font-serif text-3xl text-paper">Tax calculators</h1>
      <p className="mt-2 text-sm text-smoke">Choose a tool below. It opens in a pop-up window.</p>
      <div className="mt-8"><ToolGrid /></div>
    </div>
  );
}
