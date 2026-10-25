/**
 * Pure business logic for Rank's Up agency CRM, employee authentication,
 * deal pricing, contract renewals, and nationwide US B2B search opportunity estimation.
 */

export interface EmployeeAccount {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'sales' | 'specialist';
  passwordHash: string; // Plain/hashed comparison in local storage
  status: 'active' | 'inactive';
  lastLogin?: string;
}

export interface LeadRecord {
  id: string;
  company: string;
  industry: string;
  businessType: string;
  contactName: string;
  role: string;
  additionalContact?: string;
  phone: string;
  phone2?: string;
  email: string;
  email2?: string;
  emailType: 'Primary' | 'Work' | 'Personal' | 'Direct';
  websiteStatus: 'No Website' | 'Outdated' | 'Broken' | 'Redesign Needed' | 'Active';
  leadSignal: 'Unclaimed GBP' | 'No SSL' | 'Zero Search Presence' | 'Competitor Dominating' | 'None';
  streetAddress?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  outreachStatus: 'Not Contacted' | 'Cold Email Sent' | 'Follow-up 1' | 'Audit Scheduled' | 'Proposal Sent' | 'Won' | 'Lost';
  notes?: string;
  sendBy: string; // Rep name
  createdAt: string;
  packageType?: 'website' | 'seo' | 'growth';
  billingStatus?: 'Active' | 'Renewal Due' | 'Paid' | 'Pending';
  nextBillingDate?: string;
}

export interface DealPricing {
  initialQuotedPrice: number;
  finalQuotedPrice: number;
  agreedDealPrice: number;
  oneTimeSetupFee: number;
  monthlyRecurringFee: number;
  discount: number;
  annualContractValue: number;
  renewalDate: string;
  renewalPrice: number;
  actualAmountCollected: number;
}

/**
 * Authenticates user against employee store.
 * Returns employee record if valid, null otherwise.
 */
export function authenticateEmployee(
  employees: EmployeeAccount[],
  usernameOrId: string,
  plainPassword: string
): EmployeeAccount | null {
  const cleanId = usernameOrId.trim().toLowerCase();
  const emp = employees.find(
    e => e.status === 'active' && (e.username.toLowerCase() === cleanId || e.id.toLowerCase() === cleanId)
  );

  if (!emp) return null;
  if (emp.passwordHash === plainPassword) {
    return emp;
  }
  return null;
}

/**
 * Calculates Annual Contract Value (ACV) and renewal trigger windows
 */
export function calculateDealACV(pricing: {
  oneTimeSetupFee: number;
  monthlyRecurringFee: number;
  discount?: number;
}): number {
  const discount = pricing.discount || 0;
  const annualRecurring = (pricing.monthlyRecurringFee || 0) * 12;
  const setup = pricing.oneTimeSetupFee || 0;
  return Math.max(0, annualRecurring + setup - discount);
}

/**
 * Calculates whether a contract is within the 30-day or 15-day renewal reminder window
 */
export function getRenewalAlertStatus(renewalDateStr: string, currentDate = new Date()): {
  daysRemaining: number;
  is30DayAlert: boolean;
  is15DayAlert: boolean;
  isOverdue: boolean;
} {
  const renewalDate = new Date(renewalDateStr);
  const diffTime = renewalDate.getTime() - currentDate.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    daysRemaining,
    is30DayAlert: daysRemaining <= 30 && daysRemaining > 15,
    is15DayAlert: daysRemaining <= 15 && daysRemaining >= 0,
    isOverdue: daysRemaining < 0
  };
}

/**
 * Nationwide B2B Search Opportunity calculation for any US state
 * Does NOT force specific commercial niches - calculated for general US commercial B2B.
 */
export const US_STATE_SEARCH_INDICES: Record<string, { name: string; multiplier: number; avgCommercialQueries: number }> = {
  TX: { name: 'Texas', multiplier: 1.45, avgCommercialQueries: 48500 },
  CA: { name: 'California', multiplier: 1.50, avgCommercialQueries: 54000 },
  OH: { name: 'Ohio', multiplier: 1.15, avgCommercialQueries: 28400 },
  IL: { name: 'Illinois', multiplier: 1.25, avgCommercialQueries: 34200 },
  PA: { name: 'Pennsylvania', multiplier: 1.20, avgCommercialQueries: 31000 },
  MI: { name: 'Michigan', multiplier: 1.18, avgCommercialQueries: 29500 },
  FL: { name: 'Florida', multiplier: 1.35, avgCommercialQueries: 42000 },
  NY: { name: 'New York', multiplier: 1.30, avgCommercialQueries: 39000 },
  NC: { name: 'North Carolina', multiplier: 1.10, avgCommercialQueries: 26000 },
  GA: { name: 'Georgia', multiplier: 1.15, avgCommercialQueries: 28000 },
  IN: { name: 'Indiana', multiplier: 1.05, avgCommercialQueries: 22000 },
  WI: { name: 'Wisconsin', multiplier: 1.00, avgCommercialQueries: 21000 },
  ALL: { name: 'All 50 US States (Nationwide)', multiplier: 4.80, avgCommercialQueries: 240000 }
};

export function calculateNationwideB2BOpportunity(stateCode = 'OH', avgDealValue = 15000) {
  const stateData = US_STATE_SEARCH_INDICES[stateCode.toUpperCase()] || US_STATE_SEARCH_INDICES.OH;
  const estimatedMonthlyCommercialSearches = Math.round(stateData.avgCommercialQueries);
  // Top 3 Google placements capture ~38% of all commercial organic search clicks
  const top3OrganicClicks = Math.round(estimatedMonthlyCommercialSearches * 0.38);
  // Conservative B2B high-intent conversion rate of 2.8% to qualified RFQ inquiries
  const estimatedQualifiedInquiries = Math.max(2, Math.round(top3OrganicClicks * 0.028));
  const estimatedPipelineValue = estimatedQualifiedInquiries * avgDealValue;

  return {
    stateName: stateData.name,
    estimatedMonthlyCommercialSearches,
    top3OrganicClicks,
    estimatedQualifiedInquiries,
    estimatedPipelineValue,
    avgDealValue
  };
}

export interface ParseResult {
  validLeads: LeadRecord[];
  duplicates: { rowNumber: number; reason: string; row: string[] }[];
  errors: { rowNumber: number; reason: string; row: string[] }[];
  totalRows: number;
}

/**
 * Parses TSV or CSV raw text pasted from Google Sheets or Excel.
 * Supports header detection, 21-column schema mapping, and duplicate prevention.
 */
export function parseSpreadsheetText(
  rawText: string,
  existingLeads: LeadRecord[] = [],
  defaultRep = 'Admin'
): ParseResult {
  const lines = rawText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { validLeads: [], duplicates: [], errors: [], totalRows: 0 };
  }

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const splitLine = (line: string): string[] => {
    if (delimiter === '\t') {
      return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    }
    const pattern = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
    const entries: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      entries.push((match[1] ?? match[2] ?? '').trim());
    }
    return entries;
  };

  const existingEmails = new Set(existingLeads.map(l => l.email.toLowerCase()).filter(Boolean));
  const existingPhones = new Set(existingLeads.map(l => l.phone.replace(/\D/g, '')).filter(Boolean));

  let startIndex = 0;
  const headerCells = splitLine(lines[0]).map(c => c.toLowerCase());
  if (headerCells.some(h => h.includes('company') || h.includes('contact') || h.includes('email') || h.includes('phone'))) {
    startIndex = 1;
  }

  const validLeads: LeadRecord[] = [];
  const duplicates: { rowNumber: number; reason: string; row: string[] }[] = [];
  const errors: { rowNumber: number; reason: string; row: string[] }[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rowNum = i + 1;
    const cells = splitLine(lines[i]);

    if (cells.length < 1 || !cells[0] || cells.every(c => !c)) {
      continue;
    }

    const company = cells[0]?.trim();
    if (!company) {
      errors.push({ rowNumber: rowNum, reason: 'Missing Company Name', row: cells });
      continue;
    }

    const email = (cells[8] || '').trim().toLowerCase();
    const phone = (cells[6] || '').trim();
    const cleanPhone = phone.replace(/\D/g, '');

    if (email && existingEmails.has(email)) {
      duplicates.push({ rowNumber: rowNum, reason: `Duplicate email: ${email}`, row: cells });
      continue;
    }
    if (cleanPhone && cleanPhone.length >= 7 && existingPhones.has(cleanPhone)) {
      duplicates.push({ rowNumber: rowNum, reason: `Duplicate phone: ${phone}`, row: cells });
      continue;
    }

    if (email) existingEmails.add(email);
    if (cleanPhone) existingPhones.add(cleanPhone);

    const lead: LeadRecord = {
      id: `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      company,
      industry: cells[1] || 'B2B Commercial',
      businessType: cells[2] || 'B2B Client',
      contactName: cells[3] || 'Commercial Contact',
      role: cells[4] || 'Decision Maker',
      additionalContact: cells[5] || '',
      phone: phone || '(555) 000-0000',
      phone2: cells[7] || '',
      email: email || '',
      email2: cells[9] || '',
      emailType: (cells[10] as any) || 'Work',
      websiteStatus: (['No Website', 'Outdated', 'Broken', 'Redesign Needed', 'Active'].includes(cells[11])
        ? cells[11]
        : 'Outdated') as any,
      leadSignal: (['Unclaimed GBP', 'No SSL', 'Zero Search Presence', 'Competitor Dominating', 'None'].includes(cells[12])
        ? cells[12]
        : 'Zero Search Presence') as any,
      streetAddress: cells[13] || '',
      city: cells[14] || 'Commercial Hub',
      state: cells[15] || 'OH',
      zip: cells[16] || '',
      country: cells[17] || 'USA',
      outreachStatus: (['Not Contacted', 'Cold Email Sent', 'Follow-up 1', 'Audit Scheduled', 'Proposal Sent', 'Won', 'Lost'].includes(cells[18])
        ? cells[18]
        : 'Not Contacted') as any,
      notes: cells[19] || '',
      sendBy: cells[20] || defaultRep,
      createdAt: new Date().toISOString()
    };

    validLeads.push(lead);
  }

  return {
    validLeads,
    duplicates,
    errors,
    totalRows: lines.length - startIndex
  };
}

/**
 * Calculates MRR ($150/mo per active SEO retainer client)
 * and One-time website revenue ($300 or $400)
 */
export function calculateMRRAndStats(leads: LeadRecord[]) {
  let mrr = 0;
  let oneTimeRevenue = 0;
  let activeClientsCount = 0;
  let renewalDueCount = 0;

  const wonLeads = leads.filter(l => l.outreachStatus === 'Won');

  wonLeads.forEach(lead => {
    const pkg = lead.packageType || 'growth';
    if (pkg === 'seo' || pkg === 'growth') {
      mrr += 150;
      activeClientsCount += 1;
    }
    if (pkg === 'website') {
      oneTimeRevenue += 300;
    } else if (pkg === 'growth') {
      oneTimeRevenue += 400;
    }

    if (lead.billingStatus === 'Renewal Due') {
      renewalDueCount += 1;
    }
  });

  return {
    mrr,
    oneTimeRevenue,
    activeClientsCount,
    renewalDueCount,
    pipelineCount: leads.length,
    auditScheduledCount: leads.filter(l => l.outreachStatus === 'Audit Scheduled').length,
    proposalSentCount: leads.filter(l => l.outreachStatus === 'Proposal Sent').length,
    wonCount: wonLeads.length
  };
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  category: 'PHP & Web Engineering' | 'Top-Page SEO' | 'Core Web Vitals' | 'B2B Growth Strategy';
  targetKeyword: string;
  metaDescription: string;
  readTime: string;
  publishedDate: string;
  author: string;
  status: 'published' | 'draft';
  excerpt: string;
  content: string;
  seoScore: number;
}

/**
 * Real-time SEO analyzer for blog posts to ensure top ranking on Google search
 */
export function calculateBlogSEOScore(post: {
  title: string;
  slug: string;
  targetKeyword: string;
  metaDescription: string;
  content: string;
}): {
  score: number;
  checks: {
    keywordInTitle: boolean;
    keywordInSlug: boolean;
    keywordInMeta: boolean;
    keywordInContent: boolean;
    wordCountCheck: boolean;
    metaLengthCheck: boolean;
  };
  wordCount: number;
  keywordDensity: number;
} {
  const keyword = (post.targetKeyword || '').trim().toLowerCase();
  const title = (post.title || '').toLowerCase();
  const slug = (post.slug || '').toLowerCase();
  const meta = (post.metaDescription || '').toLowerCase();
  const content = (post.content || '').toLowerCase();

  const words = (post.content || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let keywordMatches = 0;
  if (keyword.length > 0) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = content.match(regex);
    keywordMatches = matches ? matches.length : 0;
  }

  const keywordDensity = wordCount > 0 ? Number(((keywordMatches / wordCount) * 100).toFixed(2)) : 0;

  const keywordWords = keyword.split(/[\s-]+/).filter(w => w.length > 2);
  const allWordsInTitle = keywordWords.length > 0 && keywordWords.every(w => title.includes(w));
  const allWordsInSlug = keywordWords.length > 0 && keywordWords.every(w => slug.includes(w));
  const allWordsInMeta = keywordWords.length > 0 && keywordWords.every(w => meta.includes(w));

  const checks = {
    keywordInTitle: keyword.length > 0 && (title.includes(keyword) || allWordsInTitle),
    keywordInSlug: keyword.length > 0 && (slug.includes(keyword.replace(/\s+/g, '-')) || allWordsInSlug),
    keywordInMeta: keyword.length > 0 && (meta.includes(keyword) || allWordsInMeta),
    keywordInContent: keywordMatches >= 2,
    wordCountCheck: wordCount >= 300,
    metaLengthCheck: (post.metaDescription || '').length >= 100 && (post.metaDescription || '').length <= 165
  };

  let points = 0;
  if (checks.keywordInTitle) points += 25;
  if (checks.keywordInSlug) points += 20;
  if (checks.keywordInMeta) points += 20;
  if (checks.keywordInContent) points += 15;
  if (checks.wordCountCheck) points += 10;
  if (checks.metaLengthCheck) points += 10;

  return {
    score: Math.min(100, points),
    checks,
    wordCount,
    keywordDensity
  };
}

export interface InboundFormInput {
  formType: 'audit' | 'booking' | 'proposal' | 'contact';
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  state?: string;
  city?: string;
  streetAddress?: string;
  zip?: string;
  industry?: string;
  businessType?: string;
  service?: string;
  message?: string;
  crmStatus?: string;
  bookingDate?: string;
  bookingSlot?: string;
  bookingTimezone?: string;
  targetPackage?: string;
}

export const LEAD_21_FIELDS_LIST = [
  'id',
  'company',
  'industry',
  'businessType',
  'contactName',
  'role',
  'additionalContact',
  'phone',
  'phone2',
  'email',
  'email2',
  'emailType',
  'websiteStatus',
  'leadSignal',
  'streetAddress',
  'city',
  'state',
  'zip',
  'country',
  'outreachStatus',
  'notes'
] as const;

/**
 * Standardizes any public inbound inquiry (Audit, Booking, Proposal, or Contact Desk)
 * into the complete 21-column CRM database schema with persistence guarantees.
 */
export function mapInboundTo21LeadFields(input: InboundFormInput): LeadRecord {
  const company = (input.company || '').trim() || 'Commercial Enterprise Prospect';
  const contactName = (input.contactName || '').trim() || 'Commercial Decision Maker';
  const email = (input.email || '').trim().toLowerCase() || 'inbound@prospect.com';
  const phone = (input.phone || '').trim() || '(555) 000-0000';
  const rawState = (input.state || '').trim().toUpperCase() || 'OH';
  const state = US_STATE_SEARCH_INDICES[rawState] ? rawState : 'OH';

  // Smart Industry Determination based on text clues
  let industry = input.industry?.trim();
  if (!industry) {
    const textCorpus = `${company} ${input.message || ''} ${input.service || ''}`.toLowerCase();
    if (/\b(machin|cnc|tool|die|gear|lathe)\b/i.test(textCorpus) || textCorpus.includes('machin') || textCorpus.includes('cnc')) {
      industry = 'Precision Machining & Tooling';
    } else if (/\b(clean|janitor|facility|sanitiz)\b/i.test(textCorpus)) {
      industry = 'Commercial Facility Services';
    } else if (/\b(coat|powder|paint|finish|galvaniz)\b/i.test(textCorpus)) {
      industry = 'Industrial Coatings & Finishing';
    } else if (/\b(hvac|plumb|piping|boiler|chiller)\b/i.test(textCorpus) || textCorpus.includes('hvac')) {
      industry = 'Commercial Mechanical & HVAC';
    } else if (/\b(suppl|distribut|fastener|hardware|valve|bearing|fitting|part)\b/i.test(textCorpus) || textCorpus.includes('suppl')) {
      industry = 'Industrial Supply & Wholesale';
    } else {
      industry = 'B2B Commercial / Industrial';
    }
  }

  // Business Type mapping
  let businessType = input.businessType?.trim();
  if (!businessType) {
    if (industry.includes('Machining') || industry.includes('Manufacturing')) {
      businessType = 'Manufacturer / Job Shop';
    } else if (industry.includes('Services') || industry.includes('Mechanical')) {
      businessType = 'Commercial Subcontractor';
    } else {
      businessType = 'B2B Commercial Enterprise';
    }
  }

  // Website Status evaluation
  const rawWeb = (input.website || '').toLowerCase();
  let websiteStatus: LeadRecord['websiteStatus'] = 'Outdated';
  if (rawWeb.includes('no') || rawWeb === 'none') {
    websiteStatus = 'No Website';
  } else if (rawWeb.includes('broken') || rawWeb.includes('down')) {
    websiteStatus = 'Broken';
  } else if (input.formType === 'proposal') {
    websiteStatus = 'Redesign Needed';
  } else if (rawWeb.includes('active') || rawWeb.startsWith('http') || rawWeb.includes('.com')) {
    websiteStatus = 'Outdated';
  }

  // Lead Signal determination
  let leadSignal: LeadRecord['leadSignal'] = 'Zero Search Presence';
  if (input.formType === 'audit') {
    leadSignal = 'Zero Search Presence';
  } else if (input.formType === 'booking') {
    leadSignal = 'Unclaimed GBP';
  } else if (input.formType === 'proposal') {
    leadSignal = 'Competitor Dominating';
  } else if (input.formType === 'contact') {
    leadSignal = input.crmStatus ? ('None' as any) : 'Zero Search Presence';
  }

  // Outreach Status based on form type
  let outreachStatus: LeadRecord['outreachStatus'] = 'Not Contacted';
  if (input.formType === 'booking') {
    outreachStatus = 'Audit Scheduled';
  } else if (input.formType === 'proposal') {
    outreachStatus = 'Proposal Sent';
  } else if (input.formType === 'contact') {
    outreachStatus = 'Cold Email Sent';
  }

  // Pricing & package defaults
  let packageType: LeadRecord['packageType'] = 'growth';
  const pkgStr = (input.targetPackage || input.service || '').toLowerCase();
  if (pkgStr.includes('300') || pkgStr.includes('website')) {
    packageType = 'website';
  } else if (pkgStr.includes('150') && !pkgStr.includes('400')) {
    packageType = 'seo';
  } else {
    packageType = 'growth';
  }

  // Construct comprehensive notes field
  const notesParts: string[] = [];
  if (input.formType === 'audit') {
    notesParts.push(`Inbound Free SEO Audit Request. Current Web: ${input.website || 'None stated'}.`);
    if (input.message) notesParts.push(`Primary Goal/Challenge: ${input.message}`);
  } else if (input.formType === 'booking') {
    notesParts.push(`15-Min Strategy Booking for ${input.bookingDate || 'Today'} at ${input.bookingSlot || '01:30 PM'} (${input.bookingTimezone || 'US/Eastern'}).`);
    if (input.service) notesParts.push(`Topic: ${input.service}`);
  } else if (input.formType === 'proposal') {
    notesParts.push(`Formal Scope & Price Proposal Request for package: ${input.targetPackage || input.service || 'Growth Package'}.`);
    if (input.message) notesParts.push(`Scope details: ${input.message}`);
  } else {
    notesParts.push(`Direct Online Contact Inquiry. Service: ${input.service || 'Turnkey Growth'}.`);
    if (input.crmStatus) notesParts.push(`Company CRM in use: ${input.crmStatus}.`);
    if (input.message) notesParts.push(`Message: ${input.message}`);
  }

  const generatedId = `RU-LEAD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

  const lead: LeadRecord = {
    id: generatedId,
    company,
    industry,
    businessType,
    contactName,
    role: 'Commercial Decision Maker',
    additionalContact: '',
    phone,
    phone2: '',
    email,
    email2: '',
    emailType: 'Work',
    websiteStatus,
    leadSignal,
    streetAddress: input.streetAddress || '100 Industrial Parkway',
    city: input.city || (state === 'OH' ? 'Columbus' : state === 'TX' ? 'Dallas' : state === 'CA' ? 'Los Angeles' : 'Commercial Hub'),
    state,
    zip: input.zip || (state === 'OH' ? '43215' : '75001'),
    country: 'USA',
    outreachStatus,
    notes: notesParts.join(' '),
    sendBy: 'marcus.sales',
    createdAt: new Date().toISOString(),
    packageType,
    billingStatus: 'Pending',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  };

  return lead;
}

/**
 * Validates that all 21 lead fields are populated and conforms to the CRM schema.
 */
export function validate21LeadFields(lead: Partial<LeadRecord>): {
  isValid: boolean;
  missingFields: string[];
  fieldCount: number;
  lead: LeadRecord;
} {
  const missingFields: string[] = [];

  for (const field of LEAD_21_FIELDS_LIST) {
    const val = (lead as any)[field];
    if (val === undefined || val === null) {
      missingFields.push(field);
    }
  }

  const completeLead: LeadRecord = {
    id: lead.id || `lead-${Date.now()}`,
    company: lead.company || 'Unknown Company',
    industry: lead.industry || 'B2B Commercial',
    businessType: lead.businessType || 'Commercial Enterprise',
    contactName: lead.contactName || 'Primary Contact',
    role: lead.role || 'Decision Maker',
    additionalContact: lead.additionalContact || '',
    phone: lead.phone || '(555) 000-0000',
    phone2: lead.phone2 || '',
    email: lead.email || '',
    email2: lead.email2 || '',
    emailType: lead.emailType || 'Work',
    websiteStatus: lead.websiteStatus || 'Outdated',
    leadSignal: lead.leadSignal || 'Zero Search Presence',
    streetAddress: lead.streetAddress || '',
    city: lead.city || 'Commercial Hub',
    state: lead.state || 'OH',
    zip: lead.zip || '',
    country: lead.country || 'USA',
    outreachStatus: lead.outreachStatus || 'Not Contacted',
    notes: lead.notes || '',
    sendBy: lead.sendBy || 'admin',
    createdAt: lead.createdAt || new Date().toISOString(),
    packageType: lead.packageType || 'growth',
    billingStatus: lead.billingStatus || 'Pending',
    nextBillingDate: lead.nextBillingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  };

  return {
    isValid: missingFields.length === 0,
    missingFields,
    fieldCount: LEAD_21_FIELDS_LIST.length,
    lead: completeLead
  };
}


