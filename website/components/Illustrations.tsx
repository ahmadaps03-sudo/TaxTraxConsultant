// Original SVG illustrations (no third-party assets) for the TaxTrax homepage.
const R = "#FF0404", D = "#2D2D2D";

export function AdvisorIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 360" className={className} aria-hidden>
      <circle cx="160" cy="190" r="140" fill="#FFF0F0" />
      <circle cx="160" cy="190" r="140" fill="none" stroke={R} strokeOpacity=".25" strokeDasharray="4 8" strokeWidth="2" />
      <path d="M70 360c0-70 40-110 90-110s90 40 90 110Z" fill={D} />
      <path d="M140 250l20 40 20-40Z" fill="#fff" />
      <path d="M160 262l-8 14 8 44 8-44Z" fill={R} />
      <rect x="146" y="214" width="28" height="30" rx="10" fill="#F2B79A" />
      <ellipse cx="160" cy="180" rx="44" ry="50" fill="#F8C7AC" />
      <path d="M114 176c-6-46 30-66 64-56 26 8 30 34 26 56-10-22-22-30-46-30s-34 12-44 30Z" fill="#1F1F1F" />
      <circle cx="145" cy="184" r="3.5" fill={D} /><circle cx="175" cy="184" r="3.5" fill={D} />
      <path d="M148 205q12 10 24 0" stroke={D} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="196" y="262" width="88" height="62" rx="8" fill="#fff" stroke={D} strokeWidth="3" />
      <path d="M208 310l16-18 14 10 22-26 12 12" stroke={R} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(24 96)"><rect width="96" height="44" rx="12" fill="#fff" stroke="#eee" /><circle cx="22" cy="22" r="11" fill={R} /><path d="M17 22l4 4 8-8" stroke="#fff" strokeWidth="3" fill="none" /><rect x="40" y="14" width="46" height="6" rx="3" fill={D} /><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#ccc" /></g>
    </svg>
  );
}

export function PhoneMockup({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 480" className={className} aria-hidden>
      <rect x="20" y="8" width="220" height="464" rx="36" fill={D} />
      <rect x="32" y="22" width="196" height="436" rx="26" fill="#fff" />
      <rect x="100" y="28" width="60" height="10" rx="5" fill={D} />
      <rect x="32" y="48" width="196" height="92" fill={R} />
      <text x="48" y="82" fill="#fff" fontSize="13" fontFamily="sans-serif">Welcome back</text>
      <text x="48" y="112" fill="#fff" fontSize="20" fontWeight="700" fontFamily="sans-serif">Tax Year 2026</text>
      {[["Documents", "12"], ["Tasks", "3"], ["Invoices", "1"]].map(([l, v], i) => (
        <g key={l} transform={`translate(${44 + i * 62} 156)`}><rect width="54" height="58" rx="12" fill="#FFF0F0" /><text x="27" y="26" textAnchor="middle" fontSize="18" fontWeight="700" fill={R} fontFamily="sans-serif">{v}</text><text x="27" y="46" textAnchor="middle" fontSize="8" fill={D} fontFamily="sans-serif">{l}</text></g>
      ))}
      {[["Upload W-2 form", "Done", "#16A34A"], ["Sign engagement letter", "Pending", "#F59E0B"], ["Review draft 1040", "Action", R]].map(([t, s, c], i) => (
        <g key={t} transform={`translate(44 ${234 + i * 52})`}><rect width="172" height="42" rx="10" fill="#fff" stroke="#eee" /><circle cx="18" cy="21" r="8" fill={c} fillOpacity=".18" /><circle cx="18" cy="21" r="4" fill={c} /><text x="34" y="19" fontSize="10" fontWeight="600" fill={D} fontFamily="sans-serif">{t}</text><text x="34" y="32" fontSize="8.5" fill={c} fontFamily="sans-serif">{s}</text></g>
      ))}
      <rect x="44" y="404" width="172" height="32" rx="16" fill={R} />
      <text x="130" y="425" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="sans-serif">Book a Consultation</text>
    </svg>
  );
}

const PINS: [string, number, number][] = [["Pakistan", 218, 118], ["UAE", 190, 128], ["UK", 132, 76], ["USA", 52, 96]];
export function WorldMap({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 170" className={className} aria-hidden>
      <g fill="#E6E6E6">
        <path d="M18 60c12-22 46-30 70-24l16 14-10 22 8 20-22 16-14 26-22-30-24-20Z" />
        <path d="M118 52c10-12 34-14 46-6l22-2 40 6 30 20-8 22-22 6-14 20-24 4-18 24-18-24-16-26-8-22Z" />
        <path d="M100 112l20-6 14 22-6 28-18-14Z" />
      </g>
      <g fill="#D4D4D4">{Array.from({ length: 60 }).map((_, i) => <circle key={i} cx={20 + (i % 15) * 19} cy={30 + Math.floor(i / 15) * 34} r="1.4" />)}</g>
      <path d="M52 96Q90 40 132 76M132 76Q160 80 190 128M190 128L218 118" stroke={R} strokeOpacity=".5" strokeDasharray="3 4" fill="none" />
      {PINS.map(([n, x, y]) => (
        <g key={n} transform={`translate(${x} ${y})`}>
          <circle r="9" fill={R} fillOpacity=".2"><animate attributeName="r" values="6;13;6" dur="2.4s" repeatCount="indefinite" /></circle>
          <circle r="4.5" fill={R} /><text y="-12" textAnchor="middle" fontSize="9" fontWeight="700" fill={D} fontFamily="sans-serif">{n}</text>
        </g>
      ))}
    </svg>
  );
}

const THUMBS = [
  <g key="a"><rect x="60" y="30" width="80" height="100" rx="8" fill="#fff" /><rect x="72" y="46" width="56" height="7" rx="3" fill={D} /><rect x="72" y="62" width="40" height="5" rx="2" fill="#ccc" /><path d="M72 108l16-16 12 8 20-24" stroke={R} strokeWidth="4" fill="none" strokeLinecap="round" /></g>,
  <g key="b"><circle cx="100" cy="80" r="46" fill="#fff" /><path d="M100 80V34a46 46 0 0 1 40 68Z" fill={R} /><circle cx="100" cy="80" r="20" fill="#fff" /></g>,
  <g key="c"><rect x="56" y="44" width="88" height="70" rx="10" fill="#fff" /><path d="M56 64h88" stroke={D} strokeWidth="6" /><rect x="68" y="80" width="30" height="8" rx="4" fill={R} /><rect x="68" y="94" width="50" height="6" rx="3" fill="#ccc" /></g>,
];
export function ResourceThumb({ i, className = "" }: { i: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 160" className={className} aria-hidden>
      <rect width="200" height="160" fill={["#2D2D2D", "#FF0404", "#F5F5F5"][i % 3]} />
      <circle cx="170" cy="20" r="50" fill="#fff" fillOpacity=".08" />
      {THUMBS[i % 3]}
    </svg>
  );
}
