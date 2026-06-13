/**
 * Seeds PostgreSQL with the same sample dataset the app renders from, so the
 * database path (USE_DATABASE=true) matches the static MVP exactly.
 *
 * Run with: npm run seed   (tsx prisma/seed.ts)
 */
import { PrismaClient } from "@prisma/client";
import {
  companies,
  states,
  countries,
  iceRows,
  iceByState,
  iceByCountry,
  cbpRows,
  cbpMonthly,
  cbpByCountry,
  visaRows,
  visaByCountry,
  wageRows,
  wageByState,
  layoffRows,
} from "../src/lib/sample-data";
import { buildMetrics } from "../src/lib/data";
import { refreshRows } from "../src/lib/refresh";
import { seoPages } from "../src/lib/seo-pages";
import { SOURCES } from "../src/lib/sources";

const prisma = new PrismaClient();

const validStateCodes = new Set(states.map((s) => s.code));
const stateOrNull = (code?: string | null) =>
  code && validStateCodes.has(code) ? code : null;
const normalize = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

async function main() {
  console.log("⏳ Seeding ImmigrationClock sample data…");

  // ---- Clean (child → parent) -------------------------------------------
  await prisma.refreshLog.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.seoPage.deleteMany();
  await prisma.h1BEmployer.deleteMany();
  await prisma.h1BCase.deleteMany();
  await prisma.lcaFiling.deleteMany();
  await prisma.warnLayoff.deleteMany();
  await prisma.visaIssuance.deleteMany();
  await prisma.blsWage.deleteMany();
  await prisma.cbpEncounter.deleteMany();
  await prisma.iceEnforcement.deleteMany();
  await prisma.detentionStat.deleteMany();
  await prisma.company.deleteMany();
  await prisma.country.deleteMany();
  await prisma.state.deleteMany();
  await prisma.dataSource.deleteMany();

  // ---- Provenance --------------------------------------------------------
  for (const s of SOURCES) {
    await prisma.dataSource.create({
      data: {
        key: s.key,
        name: s.name,
        agency: s.agency,
        description: s.description,
        homepageUrl: s.homepageUrl,
        datasetUrl: s.datasetUrl,
        cadence: s.cadence,
        lastRefreshAt: new Date(),
        nextRefreshAt: new Date(Date.now() + 30 * 864e5),
      },
    });
  }

  // ---- Dimensions --------------------------------------------------------
  await prisma.state.createMany({
    data: states.map((s) => ({
      code: s.code,
      name: s.name,
      region: s.region,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      sourceUpdatedAt: new Date(s.sourceUpdatedAt),
    })),
  });

  await prisma.country.createMany({
    data: countries.map((c) => ({
      slug: c.slug,
      name: c.name,
      region: c.region,
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
      sourceUpdatedAt: new Date(c.sourceUpdatedAt),
    })),
  });

  for (const c of companies) {
    await prisma.company.create({
      data: {
        slug: c.slug,
        name: c.name,
        normalizedName: normalize(c.name),
        industry: c.industry,
        headquartersCity: c.headquartersCity,
        stateCode: stateOrNull(c.stateCode),
        website: c.website,
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        sourceUpdatedAt: new Date(c.sourceUpdatedAt),
      },
    });
  }
  const companyIdBySlug = Object.fromEntries(
    (await prisma.company.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id])
  );

  // ---- H-1B employer summaries + LCA filings -----------------------------
  for (const c of companies) {
    const companyId = companyIdBySlug[c.slug];
    await prisma.h1BEmployer.createMany({
      data: c.years.map((y) => ({
        companyId,
        fiscalYear: y.fiscalYear,
        initialApprovals: y.initialApprovals,
        initialDenials: y.initialDenials,
        continuingApprovals: y.continuingApprovals,
        continuingDenials: y.continuingDenials,
        stateCode: stateOrNull(c.stateCode),
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        sourceUpdatedAt: new Date(c.sourceUpdatedAt),
      })),
    });

    const latest = c.years[c.years.length - 2];
    const worksite = c.topWorksites[0];
    await prisma.lcaFiling.createMany({
      data: c.topJobTitles.map((t) => ({
        companyId,
        fiscalYear: latest.fiscalYear,
        jobTitle: t.title,
        worksiteCity: worksite?.city,
        stateCode: stateOrNull(worksite?.stateCode),
        offeredWage: t.avgWage,
        prevailingWage: Math.round(t.avgWage * 0.95),
        caseStatus: "CERTIFIED",
        filings: Math.round(latest.lcaFilings * t.share),
        sourceName: "DOL OFLC Disclosure Data (LCA / PERM)",
        sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
        sourceUpdatedAt: new Date(c.sourceUpdatedAt),
      })),
    });
  }

  // ---- Enforcement -------------------------------------------------------
  const iceAll = [...iceRows, ...iceByState, ...iceByCountry];
  await prisma.iceEnforcement.createMany({
    data: iceAll.map((r) => ({
      fiscalYear: r.fiscalYear,
      arrests: r.arrests,
      removals: r.removals,
      criminalArrests: r.criminalArrests,
      nonCriminal: r.nonCriminal,
      stateCode: stateOrNull(r.stateCode),
      country: r.country ?? null,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  await prisma.detentionStat.createMany({
    data: iceRows.map((r) => ({
      fiscalYear: r.fiscalYear,
      averageDaily: r.detentionAvgDaily,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  // ---- Border ------------------------------------------------------------
  const cbpAll = [...cbpRows, ...cbpMonthly, ...cbpByCountry];
  await prisma.cbpEncounter.createMany({
    data: cbpAll.map((r) => ({
      fiscalYear: r.fiscalYear,
      month: r.month ?? null,
      border: r.border,
      citizenship: r.citizenship ?? null,
      totalEncounters: r.totalEncounters,
      singleAdults: r.singleAdults,
      familyUnits: r.familyUnits,
      unaccompaniedMinors: r.unaccompaniedMinors,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  // ---- Visa --------------------------------------------------------------
  const visaAll = [...visaRows, ...visaByCountry];
  await prisma.visaIssuance.createMany({
    data: visaAll.map((r) => ({
      fiscalYear: r.fiscalYear,
      visaClass: r.visaClass,
      category: r.category,
      country: r.country ?? null,
      issued: r.issued,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  // ---- Wages -------------------------------------------------------------
  const wagesAll = [...wageRows, ...wageByState];
  await prisma.blsWage.createMany({
    data: wagesAll.map((r) => ({
      year: r.year,
      socCode: r.socCode,
      occupation: r.occupation,
      stateCode: stateOrNull(r.stateCode),
      meanWage: r.meanWage,
      medianWage: r.medianWage,
      employment: r.employment,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  // ---- Layoffs -----------------------------------------------------------
  await prisma.warnLayoff.createMany({
    data: layoffRows.map((r) => ({
      companyId: r.companySlug ? companyIdBySlug[r.companySlug] ?? null : null,
      employerName: r.employerName,
      stateCode: stateOrNull(r.stateCode),
      noticeDate: new Date(r.noticeDate),
      employeesAffected: r.employeesAffected,
      city: r.city,
      reason: r.reason,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      sourceUpdatedAt: new Date(r.sourceUpdatedAt),
    })),
  });

  // ---- Headline metrics --------------------------------------------------
  for (const m of buildMetrics()) {
    await prisma.metricSnapshot.create({
      data: {
        key: m.key,
        label: m.label,
        value: m.value,
        unit: m.unit,
        fiscalYear: m.fiscalYear,
        paceEstimated: m.paceEstimated,
        trend: m.trend,
        trendPct: m.trendPct,
        status: m.status,
        tooltip: m.tooltip,
        sourceName: m.sourceName,
        sourceUrl: m.sourceUrl,
        sourceUpdatedAt: new Date(m.sourceUpdatedAt),
      },
    });
  }

  // ---- SEO pages ---------------------------------------------------------
  await prisma.seoPage.createMany({
    data: seoPages().map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      keywords: [],
      published: true,
      sourceName: "ImmigrationClock",
      sourceUrl: "https://www.dhs.gov/immigration-statistics",
      sourceUpdatedAt: new Date(),
    })),
  });

  // ---- Refresh logs ------------------------------------------------------
  const sourceIdByKey = Object.fromEntries(
    (await prisma.dataSource.findMany({ select: { id: true, key: true } })).map((d) => [d.key, d.id])
  );
  for (const r of refreshRows()) {
    const dataSourceId = sourceIdByKey[r.key];
    if (!dataSourceId) continue;
    await prisma.refreshLog.create({
      data: {
        dataSourceId,
        status: r.status,
        rowCount: r.rowCount,
        message: `Seeded ${r.rowCount} rows from sample dataset`,
        errorMessage: r.errorMessage ?? null,
        finishedAt: new Date(),
        refreshDate: new Date(r.lastRefreshAt),
      },
    });
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
