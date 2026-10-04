// Single source of truth for contact details. Edit here and the whole site updates.
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "923284675162"; // international format, digits only
export const waLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
export const askPricing = (what: string) => waLink(`Hi TaxTrax, could you share pricing for: ${what}?`);

export const OFFICE = {
  city: "Lahore",
  addressLines: ["Shop No 34 Rizwan Block Market, opposite Rizwan Park,", "Awan Town, Lahore, 54660"],
  street: "Shop No 34 Rizwan Block Market, opposite Rizwan Park, Awan Town",
  postalCode: "54660",
  phoneDisplay: "0328-4675162",
  phoneTel: "+923284675162",
  email: "info@taxtraxconsulting.com",
  hours: "Mon–Sat: 9:00 AM – 6:00 PM  |  Fri: 9:00 – 12:30",
  mapsQuery: "TaxTrax Consulting Rizwan Block Market Awan Town Lahore",
};
export const mapsDirections = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(OFFICE.mapsQuery)}`;
export const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(OFFICE.mapsQuery)}&output=embed`;
