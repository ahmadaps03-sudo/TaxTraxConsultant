import Icon from "@/components/Icon";
import { OFFICES } from "@/lib/contact";

// Office cards grouped by area. `compact` = single column (used in the narrow column of the Contact page).
export default function OfficeList({ compact = false }: { compact?: boolean }) {
  const groups = [
    { title: "Islamabad offices", items: OFFICES.filter((o) => o.city === "Islamabad") },
    { title: "Other offices", items: OFFICES.filter((o) => o.city !== "Islamabad") },
  ];
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="font-serif text-lg text-paper">{g.title}</h3>
          <div className={`mt-4 grid gap-5 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {g.items.map((o) => (
              <div key={o.id} className="card-flat card-lift flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-serif text-base text-paper">{o.name}</h4>
                  {o.head && <span className="shrink-0 rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-signal">Head office</span>}
                </div>
                <div className="mt-3 flex gap-3 text-sm text-paper/85">
                  <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-signal" />
                  <span>{o.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</span>
                </div>
                <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-auto pt-4 text-sm font-medium text-signal hover:text-ember focus-ring">Get directions &rarr;</a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
