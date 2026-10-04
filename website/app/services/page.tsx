"use client";

import { useState, useMemo } from "react";
import { services } from "@/lib/data";
import ServiceCard from "@/components/ServiceCard";

const tabs = ["All Services", ...services.map((s) => s.category)];

export default function ServicesPage() {
  const [active, setActive] = useState("All Services");
  const filtered = useMemo(
    () => (active === "All Services" ? services : services.filter((s) => s.category === active)),
    [active]
  );

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-16">
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">Our Services</h1>
      <p className="mt-3 max-w-xl text-sm text-smoke">
        Six practice lines covering Pakistan, the US, the UK and the UAE — filed by chartered accountants and enrolled agents, not templates.
      </p>

      <div className="mt-8 flex flex-wrap gap-2 border-b border-line pb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-3 py-1.5 text-sm transition-colors focus-ring ${
              active === tab ? "bg-signal text-ink" : "border border-line text-smoke hover:text-paper hover:border-signal"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <ServiceCard key={s.slug} service={s} />
        ))}
      </div>
    </div>
  );
}
