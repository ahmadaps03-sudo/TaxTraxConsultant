// Single source of truth for contact details. Edit here and the whole site updates.
// NOTE: NEXT_PUBLIC_WHATSAPP_NUMBER (in .env.local) overrides the number below. Leave it empty or set it to 923332652542.
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "923332652542"; // international format, digits only
export const waLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
export const askPricing = (what: string) => waLink(`Hi TaxTrax, could you share pricing for: ${what}?`);

// Head office (used for the phone/email/hours cards, the home-page map and the SEO structured data).
export const OFFICE = {
  city: "Islamabad",
  addressLines: ["Office # S/02, Block # 6, Opp Hills Park, GIGA City,", "Sector A, DHA Phase 2, Islamabad"],
  street: "Office # S/02, Block # 6, Opp Hills Park, GIGA City, Sector A, DHA Phase 2",
  postalCode: undefined as string | undefined, // add the postal code here if you want it in the SEO data
  phoneDisplay: "0333-2652542",
  phoneTel: "+923332652542",
  email: "info@taxtraxconsulting.com",
  hours: "Mon–Sat: 9:00 AM – 6:00 PM  |  Fri: 9:00 – 12:30",
  mapsQuery: "Office S/02 Block 6 Opposite Hills Park GIGA City Sector A DHA Phase 2 Islamabad",
};
export const mapsDirections = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(OFFICE.mapsQuery)}`;
export const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(OFFICE.mapsQuery)}&output=embed`;

// All offices shown on the Home and Contact pages. `city: "Islamabad"` offices are grouped together; the rest under "Other offices".
export type Office = { id: string; name: string; city: string; addressLines: string[]; mapsUrl: string; head?: boolean };
const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const OFFICES: Office[] = [
  { id: "dha-ii", name: "DHA-II Office", city: "Islamabad", head: true,
    addressLines: ["Office # S/02, Block # 6, Opp Hills Park, GIGA City,", "Sector A, DHA Phase 2, Islamabad"],
    mapsUrl: "https://maps.app.goo.gl/QK9ULPsJjuFoHGXt8?g_st=ic" },
  { id: "i-10", name: "I-10 Office", city: "Islamabad",
    addressLines: ["NVD Associates, Bismillah Market,", "near Azhar Mehmood Ground, Sector I-10/1, Islamabad"],
    mapsUrl: "https://maps.app.goo.gl/jt3pLbW19yyc5h336?g_st=ic" },
  { id: "hyderabad", name: "Hyderabad Office", city: "Hyderabad",
    addressLines: ["Office No. 03, First Floor, Comfort Residency,", "Main Wadhu Wah Rd, near Bypass Gate, Qasimabad, Hyderabad"],
    mapsUrl: mapsSearch("Comfort Residency, Main Wadhu Wah Rd, Qasimabad, Hyderabad") },
  { id: "sukkur", name: "Sukkur Office", city: "Sukkur",
    addressLines: ["Office # 2, near Habib Autos,", "Shikarpur Road, Sukkur"],
    mapsUrl: mapsSearch("Habib Autos, Shikarpur Road, Sukkur") },
  { id: "karachi", name: "Karachi Office", city: "Karachi",
    addressLines: ["Office # 1, Ground Floor, Corniche Towers,", "Block 2, Clifton, Karachi"],
    mapsUrl: mapsSearch("Corniche Towers, Block 2, Clifton, Karachi") },
];
