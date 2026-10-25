import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateEmployee,
  calculateDealACV,
  getRenewalAlertStatus,
  calculateNationwideB2BOpportunity,
  parseSpreadsheetText,
  calculateMRRAndStats,
  calculateBlogSEOScore,
  mapInboundTo21LeadFields,
  validate21LeadFields,
  EmployeeAccount,
  LeadRecord
} from './crmLogic.ts';

test('authenticateEmployee validates credentials correctly', () => {
  const employees: EmployeeAccount[] = [
    {
      id: 'emp-1',
      username: 'admin',
      name: 'Alex Vance',
      role: 'admin',
      passwordHash: 'admin123',
      status: 'active'
    },
    {
      id: 'emp-2',
      username: 'marcus.sales',
      name: 'Marcus Cole',
      role: 'sales',
      passwordHash: 'sales123',
      status: 'active'
    },
    {
      id: 'emp-3',
      username: 'sarah.seo',
      name: 'Sarah Lin',
      role: 'specialist',
      passwordHash: 'seo123',
      status: 'inactive'
    }
  ];

  // Success with username
  const auth1 = authenticateEmployee(employees, 'admin', 'admin123');
  assert.ok(auth1);
  assert.equal(auth1?.name, 'Alex Vance');
  assert.equal(auth1?.role, 'admin');

  // Success with ID
  const auth2 = authenticateEmployee(employees, 'emp-2', 'sales123');
  assert.ok(auth2);
  assert.equal(auth2?.name, 'Marcus Cole');

  // Wrong password
  const failPass = authenticateEmployee(employees, 'admin', 'wrongpass');
  assert.equal(failPass, null);

  // Inactive user
  const failInactive = authenticateEmployee(employees, 'sarah.seo', 'seo123');
  assert.equal(failInactive, null);
});

test('calculateDealACV and getRenewalAlertStatus evaluate financial dates accurately', () => {
  // $400 setup + $150/mo * 12 - $100 discount = $400 + $1800 - $100 = $2100
  const acv = calculateDealACV({
    oneTimeSetupFee: 400,
    monthlyRecurringFee: 150,
    discount: 100
  });
  assert.equal(acv, 2100);

  const now = new Date('2026-10-25T12:00:00Z');
  // 20 days away -> 30-day alert
  const alert30 = getRenewalAlertStatus('2026-11-14T12:00:00Z', now);
  assert.equal(alert30.is30DayAlert, true);
  assert.equal(alert30.is15DayAlert, false);

  // 10 days away -> 15-day alert
  const alert15 = getRenewalAlertStatus('2026-11-04T12:00:00Z', now);
  assert.equal(alert15.is15DayAlert, true);
  assert.equal(alert15.is30DayAlert, false);

  // Overdue
  const overdue = getRenewalAlertStatus('2026-10-20T12:00:00Z', now);
  assert.equal(overdue.isOverdue, true);
});

test('calculateNationwideB2BOpportunity estimates search metrics across US states', () => {
  const oppOH = calculateNationwideB2BOpportunity('OH', 20000);
  assert.equal(oppOH.stateName, 'Ohio');
  assert.ok(oppOH.estimatedMonthlyCommercialSearches > 20000);
  assert.ok(oppOH.top3OrganicClicks > 5000);
  assert.ok(oppOH.estimatedQualifiedInquiries >= 2);
  assert.ok(oppOH.estimatedPipelineValue > 50000);

  const oppAll = calculateNationwideB2BOpportunity('ALL', 15000);
  assert.ok(oppAll.estimatedMonthlyCommercialSearches >= 200000);
});

test('calculateBlogSEOScore validates target keywords and SEO parameters for top search ranking', () => {
  const post = {
    title: 'Why Custom PHP and JavaScript B2B Websites Outperform WordPress on Google',
    slug: 'custom-php-javascript-b2b-website',
    targetKeyword: 'custom php javascript b2b website',
    metaDescription: 'Discover why high-end custom PHP and JavaScript B2B websites achieve <0.8s load times and rank #1 on Google search for commercial US procurement RFQs.',
    content: 'When evaluating custom php javascript b2b website architecture versus sluggish legacy CMS platforms, engineering matters. A custom php javascript b2b website delivers server responses under 80ms and pristine Core Web Vitals. Google search algorithms explicitly favor ultra-low loading speeds. ' + 'Engineering high-end websites with modern JavaScript and PHP guarantees clean semantic HTML without 40 third-party plugins slowing down buyer inquiries. '.repeat(16)
  };

  const seo = calculateBlogSEOScore(post);
  assert.equal(seo.checks.keywordInTitle, true);
  assert.equal(seo.checks.keywordInSlug, true);
  assert.equal(seo.checks.keywordInMeta, true);
  assert.equal(seo.checks.keywordInContent, true);
  assert.equal(seo.checks.wordCountCheck, true);
  assert.equal(seo.checks.metaLengthCheck, true);
  assert.equal(seo.score, 100);
  assert.ok(seo.wordCount > 150);
});

test('mapInboundTo21LeadFields maps all 21 fields accurately from inbound form inquiries', () => {
  const auditLead = mapInboundTo21LeadFields({
    formType: 'audit',
    company: 'Apex Precision Machining',
    contactName: 'Dave Miller',
    email: 'dave@apexprecision.com',
    phone: '(614) 555-0199',
    website: 'apexprecision.com',
    state: 'OH',
    message: 'Competitors ranking #1 in Ohio for CNC milling'
  });

  const validation = validate21LeadFields(auditLead);
  assert.equal(validation.isValid, true);
  assert.equal(validation.missingFields.length, 0);
  assert.equal(validation.fieldCount, 21);

  assert.equal(auditLead.company, 'Apex Precision Machining');
  assert.equal(auditLead.industry, 'Precision Machining & Tooling');
  assert.equal(auditLead.businessType, 'Manufacturer / Job Shop');
  assert.equal(auditLead.leadSignal, 'Zero Search Presence');
  assert.equal(auditLead.state, 'OH');
  assert.equal(auditLead.outreachStatus, 'Not Contacted');
  assert.ok(auditLead.notes.includes('Inbound Free SEO Audit'));
});

test('mapInboundTo21LeadFields supports contact desk with custom CRM sync status', () => {
  const contactLead = mapInboundTo21LeadFields({
    formType: 'contact',
    company: 'Vanguard Industrial Supplies',
    contactName: 'Rachel Green',
    email: 'rachel@vanguard.com',
    phone: '(312) 555-8800',
    service: 'Complete Growth Bundle ($400 setup + $150/mo)',
    crmStatus: 'HubSpot',
    website: 'No Website',
    message: 'Need urgent lead pipeline and Google map pack setup'
  });

  const validation = validate21LeadFields(contactLead);
  assert.equal(validation.isValid, true);
  assert.equal(validation.lead.websiteStatus, 'No Website');
  assert.equal(validation.lead.industry, 'Industrial Supply & Wholesale');
  assert.ok(validation.lead.notes.includes('Company CRM in use: HubSpot'));
  assert.equal(validation.lead.packageType, 'growth');
});

