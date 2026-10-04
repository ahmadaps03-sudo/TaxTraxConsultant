"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { CalcId } from "@/lib/calc-meta";

// The calculators (and their maths) only download when someone opens one.
const CalculatorModal = dynamic(() => import("./CalculatorModal"), { ssr: false });
const Ctx = createContext<{ open: (id: CalcId) => void }>({ open: () => {} });
export const useCalculator = () => useContext(Ctx);

/** One popup for every calculator on the site: opened from anywhere, closed with the X, Esc or a click outside. */
export function CalculatorProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<CalcId | null>(null);
  const path = usePathname(); const router = useRouter();
  const close = useCallback(() => { setId(null); if (path.startsWith("/tools/")) router.replace("/tools", { scroll: false }); }, [path, router]);
  return <Ctx.Provider value={{ open: setId }}>{children}{id && <CalculatorModal id={id} onClose={close} />}</Ctx.Provider>;
}
