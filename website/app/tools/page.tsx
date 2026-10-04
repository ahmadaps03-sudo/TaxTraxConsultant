import { pageMeta } from "@/lib/seo";
import ToolGrid from "@/components/calculators/ToolGrid";

export const metadata = pageMeta({ title: "Free Tax Calculators & Tools", description: "Free tax calculators for Pakistan (salary, GST, business, withholding, NTN checker), the USA, the UK and the UAE.", path: "/tools" });

export default function ToolsHub() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-16">
      <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">Free Tax Calculators</h1>
      <p className="mt-3 max-w-xl text-sm text-smoke">Instant estimates for Pakistan, the USA, the UK and the UAE. Pick a tool and it opens in a pop-up; download a PDF or send the result to a TaxTrax specialist on WhatsApp.</p>
      <div className="mt-10"><ToolGrid /></div>
    </div>
  );
}
