// Mock content. Each shape here is designed to map 1:1 onto the future
// Prisma models (Service, Testimonial, CaseStudy, TeamMember, Post) so
// swapping this file for real fetches is a mechanical change later.

export type Service = {
  slug: string;
  category: string;
  flag: string;
  title: string;
  audience: string;
  deliverables: string[];
  ctas: { label: string; href: string }[];
};

export const services: Service[] = [
  {
    slug: "income-tax-return-fbr",
    category: "Income Tax Return (FBR)",
    flag: "🇵🇰",
    title: "Income Tax Return (FBR)",
    audience: "Freelancers, salaried individuals, business owners, and non-residents.",
    deliverables: [
      "FBR Iris registration, wealth statement reconciliation, and e-filing",
      "Active Taxpayer List (ATL) activation to cut withholding tax rates by 50%",
      "Audit defense & notice reply drafting",
    ],
    ctas: [
      { label: "Ask Pricing on WhatsApp", href: "wa:pricing" },
      { label: "Book a Consultation", href: "/book-consultation?service=income-tax-return-fbr" },
    ],
  },
  {
    slug: "sales-tax-registration",
    category: "Sales Tax Registration & Compliance",
    flag: "🇵🇰",
    title: "Sales Tax Registration & Compliance",
    audience: "Manufacturers, wholesalers, importers, exporters, and service providers (FBR, PRA, SRB, BRA, KPRA).",
    deliverables: [
      "Sales tax registration (STRN) and biometric verification assistance",
      "Monthly sales tax return filing & annexure matching",
      "Input tax adjustment optimization & refund processing",
    ],
    ctas: [
      { label: "Check Eligibility", href: "/contact?service=sales-tax-registration" },
      { label: "Book a Consultation", href: "/book-consultation?service=sales-tax-registration" },
    ],
  },
  {
    slug: "company-registration-secp",
    category: "Company Registration (SECP)",
    flag: "🇵🇰",
    title: "Company Registration (SECP)",
    audience: "Startups, expanding businesses, and partnerships transitioning to corporate status.",
    deliverables: [
      "Name availability reservation, Memorandum & Articles of Association (MoA/AoA)",
      "Digital Signature Certificates (DSC) & Incorporation Certificate issuance",
      "Post-incorporation compliance (Form 29, Form A, NTN allotment)",
    ],
    ctas: [
      { label: "Compare Company Types", href: "/contact?service=company-registration-secp" },
      { label: "Book a Consultation", href: "/book-consultation?service=company-registration-secp" },
    ],
  },
  {
    slug: "usa-llc-tax-filing",
    category: "USA LLC & Tax Filing",
    flag: "🇺🇸",
    title: "USA LLC & Tax Filing",
    audience: "Amazon/e-commerce sellers, IT exporters, SaaS founders, and remote agencies.",
    deliverables: [
      "50-state LLC formation (Wyoming, Delaware, Florida) + registered agent",
      "Employer Identification Number (EIN) & ITIN processing",
      "Annual filings (Form 5472 / Form 1120 for non-resident single-member LLCs)",
    ],
    ctas: [
      { label: "Ask Pricing on WhatsApp", href: "wa:pricing" },
      { label: "Book a Consultation", href: "/book-consultation?service=usa-llc-tax-filing" },
    ],
  },
  {
    slug: "uk-ltd-registration",
    category: "UK Ltd Registration & Tax Filing",
    flag: "🇬🇧",
    title: "UK Ltd / Company Registration & Tax Filing",
    audience: "Global contractors, Stripe/PayPal payment gateway seekers, and UK marketplace sellers.",
    deliverables: [
      "UK Companies House incorporation with London registered/virtual office address",
      "HMRC activation, Unique Taxpayer Reference (UTR), and VAT registration",
      "Annual Confirmation Statement & CT600 Corporate Tax Return filing",
    ],
    ctas: [
      { label: "Ask Pricing on WhatsApp", href: "wa:pricing" },
      { label: "Book a Consultation", href: "/book-consultation?service=uk-ltd-registration" },
    ],
  },
  {
    slug: "uae-vat-corporate-tax",
    category: "UAE VAT & Corporate Tax",
    flag: "🇦🇪",
    title: "UAE VAT & Corporate Tax Services",
    audience: "Traders, holding companies, consultants, and offshore entities operating in Dubai/UAE.",
    deliverables: [
      "Freezone vs. mainland business setup consultancy",
      "Federal Tax Authority (FTA) corporate tax (9%) registration & filing",
      "Quarterly UAE VAT registration & return submission",
    ],
    ctas: [
      { label: "UAE CT Guide", href: "/contact?service=uae-vat-corporate-tax" },
      { label: "Book a Consultation", href: "/book-consultation?service=uae-vat-corporate-tax" },
    ],
  },
];

export type Tool = {
  slug: string;
  icon: string;
  title: string;
  description: string;
};

export const tools: Tool[] = [
  {
    slug: "salary-tax-calculator",
    icon: "receipt",
    title: "Salary Tax Calculator",
    description: "Monthly and annual income tax withholding for salaried individuals under current FBR slabs.",
  },
  {
    slug: "sales-tax-calculator",
    icon: "calculator",
    title: "Sales Tax / GST Calculator",
    description: "Gross/net pricing and sales tax liability across FBR, PRA, SRB, KPRA and BRA.",
  },
  {
    slug: "business-tax-estimator",
    icon: "chart",
    title: "Business Tax & Profit Estimator",
    description: "Corporate, AOP and sole-proprietor tax liability after allowable expenses.",
  },
  {
    slug: "wht-calculator",
    icon: "scissors",
    title: "Withholding Tax (WHT) Calculator",
    description: "Exact withholding rates on goods, services, contracts, rent and dividends — filer vs non-filer.",
  },
  {
    slug: "filer-status-checker",
    icon: "search",
    title: "NTN & Filer Status Checker",
    description: "Guidance on verifying NTN, STRN and Active Taxpayer List (ATL) status on FBR Iris.",
  },
];

export const stats = [
  { value: "50+", label: "Companies registered — SECP, USA LLC, UK Ltd" },
  { value: "1,200+", label: "Annual income & sales tax returns filed" },
  { value: "100%", label: "Compliance rate on filings we manage" },
];

export type Testimonial = {
  name: string;
  role: string;
  location: string;
  service: string;
  quote: string;
  verified: boolean;
};

export const testimonials: Testimonial[] = [
  {
    name: "Shahzaib R.",
    role: "Founder, NovaTech Solutions",
    location: "Islamabad, PK",
    service: "USA LLC & FBR IT Exporter Filing",
    quote:
      "TaxTrax handled our Wyoming LLC formation and IRS EIN in under 10 days, then aligned our FBR exporter status back home. Finding a team that understands both US tax law and State Bank remittance rules was a game changer.",
    verified: true,
  },
  {
    name: "Ayesha M.",
    role: "Director, Meridian Textiles",
    location: "Lahore, PK",
    service: "Company Registration (SECP)",
    quote:
      "Converting from an AOP to a private limited company felt daunting until TaxTrax mapped out every filing. Our sales tax refunds finally started moving.",
    verified: true,
  },
  {
    name: "Omar K.",
    role: "General Trading, Al Fahim Group",
    location: "Dubai, UAE",
    service: "UAE VAT & Corporate Tax",
    quote:
      "They got our Freezone qualifying income documentation in order before the 9% corporate tax deadline. Zero penalties, zero stress.",
    verified: true,
  },
  {
    name: "Bilal H.",
    role: "Freelance Consultant",
    location: "Karachi, PK",
    service: "Income Tax Return (FBR)",
    quote:
      "My ATL status was restored within two days and my withholding tax dropped immediately. Filing is finally something I don't dread.",
    verified: true,
  },
];

export type CaseStudy = {
  title: string;
  profile: string;
  challenge: string;
  solution: string[];
  result: string;
};

export const caseStudies: CaseStudy[] = [
  {
    title: "Local Corporate Restructuring (SECP & FBR)",
    profile: "Medium-scale textile manufacturer, Lahore, Pakistan",
    challenge:
      "Operating as an unorganized partnership (AOP) facing high individual tax brackets, unregistered vendor withholding issues, and FBR sales tax refund delays.",
    solution: [
      "Converted the entity into an SECP private limited company",
      "Registered STRN and implemented automated sales tax input/output reconciliation",
      "Managed formal representation before FBR for sales tax refund processing",
    ],
    result: "Saved PKR 6.8M in tax liabilities in year one and unlocked PKR 12M in stalled FBR sales tax refunds.",
  },
  {
    title: "Cross-Border IT Export & USA Expansion",
    profile: "Software house & AI agency, Islamabad / remote",
    challenge:
      "High international transaction fees, payment gateway lockouts, and confusion over US non-resident tax filings (Form 5472 / 1120).",
    solution: [
      "Formed a Wyoming LLC with IRS EIN and a US Mercury bank account",
      "Structured foreign remittance under Pakistan SBP/FBR IT export tax exemption regulations",
      "Handled annual US IRS compliance and zero-tax non-resident filings",
    ],
    result: "Onboarded US enterprise clients seamlessly with 0% US tax friction and full legal repatriation into Pakistan.",
  },
  {
    title: "UAE Corporate Tax & Freezone Compliance",
    profile: "E-commerce & general trading business, Dubai / Karachi",
    challenge:
      "Transitioning to the UAE 9% corporate tax regime without risking penalties on Freezone qualifying income status.",
    solution: [
      "Conducted a transfer pricing audit",
      "Structured qualifying activity documentation for the FTA",
      "Set up quarterly VAT e-filing",
    ],
    result: "100% FTA compliance with zero tax penalties and full preservation of 0% Freezone tax status.",
  },
];

export type TeamMember = {
  name: string;
  title: string;
  credential: string;
  jurisdiction: string;
  bio: string;
  cases?: string;
};

export const team: TeamMember[] = [
  {
    name: "Fahad Zaidi",
    title: "Senior Partner & Principal Consultant",
    credential: "Advocate High Court, CTA / LL.M. Tax",
    jurisdiction: "High Court Bar Association · FBR Appellate Tribunal",
    bio: "15+ years in FBR tax advisory and SECP practice. Represented 100+ cases before the FBR Appellate Tribunal.",
  },
  {
    name: "Sana Iqbal",
    title: "Head of Corporate Filings",
    credential: "FCA — Fellow Chartered Accountant",
    jurisdiction: "Institute of Chartered Accountants of Pakistan (ICAP)",
    bio: "Leads SECP incorporation and post-incorporation compliance for 200+ companies.",
  },
  {
    name: "Daniel Cho",
    title: "US Tax Lead",
    credential: "CPA, EA — Enrolled Agent",
    jurisdiction: "US State Boards of Accountancy · US Dept. of the Treasury",
    bio: "Handles LLC formation, EIN/ITIN processing, and Form 5472/1120 filings for non-resident founders.",
  },
  {
    name: "Rania Al-Suwaidi",
    title: "UAE Corporate Tax Advisor",
    credential: "CTA — Certified Tax Advisor",
    jurisdiction: "International Corporate & Cross-Border Tax Specialist",
    bio: "Structures Freezone and mainland entities for UAE's corporate tax and VAT regime.",
  },
];

export type Post = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  date: string;
  author: string;
  content: string[];
};

export const posts: Post[] = [
  {
    slug: "atl-status-explained",
    title: "What ATL status actually changes about your withholding tax",
    category: "Income Tax",
    excerpt: "Being on the Active Taxpayer List can cut your withholding rate in half. Here's how it works.",
    date: "2026-08-14",
    author: "Fahad Zaidi",
    content: [
      "The Active Taxpayer List (ATL) determines the withholding tax rate applied to a wide range of transactions — from property purchases to banking transactions and vehicle registration.",
      "Filers on the ATL typically pay significantly lower withholding rates than non-filers on the same transaction, which is why restoring ATL status quickly after a lapse matters.",
      "If your name has dropped off the list, restoration is usually possible within 24–48 hours once the outstanding return is filed and the surcharge is paid.",
    ],
  },
  {
    slug: "wyoming-llc-for-pakistani-founders",
    title: "Why Pakistani founders keep choosing Wyoming LLCs",
    category: "USA LLC",
    excerpt: "Low fees, strong privacy, and a straightforward path to an EIN — the case for Wyoming.",
    date: "2026-07-02",
    author: "Daniel Cho",
    content: [
      "Wyoming has no state income tax and comparatively low annual report fees, which makes it a common first choice for non-resident founders forming a single-member LLC.",
      "The real complexity for non-residents isn't formation — it's the annual Form 5472 and pro-forma 1120 filing, which is mandatory even with zero US-sourced income.",
      "Pairing the LLC with the right remittance structure back into Pakistan is what keeps the setup compliant on both sides of the border.",
    ],
  },
  {
    slug: "uae-freezone-qualifying-income",
    title: "UAE Freezone qualifying income: what disqualifies you",
    category: "UAE Tax",
    excerpt: "The 0% Freezone rate is conditional. Here's what activities and structures put it at risk.",
    date: "2026-06-20",
    author: "Rania Al-Suwaidi",
    content: [
      "Freezone entities can retain a 0% corporate tax rate on qualifying income, but the definition of 'qualifying' is narrower than many founders assume.",
      "Transactions with mainland UAE customers, certain excluded activities, and failing the de minimis threshold can all disqualify income from the preferential rate.",
      "A transfer pricing review before your first corporate tax filing is the cheapest way to avoid a retroactive reclassification.",
    ],
  },
];

export type Video = {
  title: string;
  category: string;
  youtubeId: string;
};

export const videos: Video[] = [
  { title: "How to check your FBR filer status in 2 minutes", category: "Income Tax", youtubeId: "dQw4w9WgXcQ" },
  { title: "SECP incorporation, step by step", category: "Company Registration", youtubeId: "dQw4w9WgXcQ" },
  { title: "Opening a US LLC as a non-resident", category: "USA LLC", youtubeId: "dQw4w9WgXcQ" },
];
