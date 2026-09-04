import { db } from './server/db.js';
import { evaluateLicense } from './server/licenseEngine.js';

console.log('--- STARTING FONT LICENSE INTELLIGENCE COMPREHENSIVE VERIFICATION ---');

// 1. Verify DB loaded correctly
const fonts = db.getFonts();
console.log(`Loaded ${fonts.length} fonts from database:`);
fonts.forEach(f => console.log(`  - ${f.family} (${f.foundry}) - PS: ${f.postscript_name}`));

if (fonts.length < 9) {
  console.error(`FAIL: Expected at least 9 fonts, loaded ${fonts.length}.`);
  process.exit(1);
}
console.log('PASS: Database fonts loaded successfully.');

// 2. Verify Font Matching Logic (Clean Search)
const searchMetadata = {
  family: 'Garamond Premier Pro',
  postscript_name: 'GaramondPremPro',
  vendor_id: 'ADBE'
};

const matches = db.matchFont(searchMetadata);
console.log(`Matching font search: ${JSON.stringify(searchMetadata)}`);
console.log(`Found ${matches.length} matching candidates.`);
matches.forEach((m, idx) => console.log(`  Candidate #${idx + 1}: ${m.font.family} (Score: ${m.score}, Conf: ${m.confidence}) - Reasons: ${m.reasons.join(', ')}`));

if (matches.length === 0 || matches[0].font.family !== 'Garamond Premier Pro') {
  console.error('FAIL: Font matching failed or incorrect match.');
  process.exit(1);
}
console.log('PASS: Font identity matching logic verified.');

// 3. Verify Messy Filename Matching (e.g. GaramondPro-Regular-FINAL2.otf)
const messyFileSearch = {
  filename: 'GaramondPro-Regular-FINAL2.otf',
  postscript_name: 'GaramondPremPro'
};
const messyMatches = db.matchFont(messyFileSearch);
console.log(`Testing messy filename stripping: "${messyFileSearch.filename}"`);
if (messyMatches.length === 0 || messyMatches[0].font.family !== 'Garamond Premier Pro') {
  console.error('FAIL: Messy filename stripping failed to match Garamond Premier Pro.');
  process.exit(1);
}
console.log(`PASS: Messy filename successfully identified as ${messyMatches[0].font.family} (Score: ${messyMatches[0].score}).`);

// 4. Verify Rules Engine Evaluation for Paperback (export-pdf)
const targetFontId = matches[0].font.font_id;
const allLicenses = db.getLicenses();
const targetLicense = allLicenses.find(l => l.font_id === targetFontId);
const allClauses = db.getClauses();
const targetClauses = allClauses.filter(c => c.license_id === targetLicense.license_id);

const projectProfile = {
  useCases: ['Paperback / printed book'],
  commercial: true,
  productionMethod: 'export-pdf' // static PDF embedding
};

const assessment = evaluateLicense(projectProfile, targetClauses);
console.log(`Overall Assessment: ${assessment.overallStatus}`);

if (assessment.overallStatus !== 'Restricted') { // Garamond has content/decency and modification restrictions
  console.error(`FAIL: Expected Restricted status due to EULA decency terms, got ${assessment.overallStatus}`);
  process.exit(1);
}

// 5. Test "Not specified ≠ Allowed" strictness
const notSpecifiedRow = assessment.restrictionsTable.find(r => r.status === 'Not specified');
if (notSpecifiedRow) {
  console.log(`Verifying 'Not specified ≠ Allowed' for: "${notSpecifiedRow.area}"`);
  if (notSpecifiedRow.explanation.toLowerCase().includes('allowed under general')) {
    console.error(`FAIL: 'Not specified' should never state 'Allowed under general terms'!`);
    process.exit(1);
  }
  if (!notSpecifiedRow.explanation.includes('No relevant provision was found')) {
    console.error(`FAIL: Expected strict missing-provision explanation for Not specified.`);
    process.exit(1);
  }
  console.log(`PASS: 'Not specified' correctly explains: "${notSpecifiedRow.explanation}"`);
}

// 6. Test Amazon KDP / IngramSpark Publishing Web Interface workflow
const projectPublishing = {
  useCases: ['Paperback / printed book'],
  commercial: true,
  productionMethod: 'publishing'
};
const assessmentKDP = evaluateLicense(projectPublishing, targetClauses);
const printerItemKDP = assessmentKDP.paperbackChecklist.find(c => c.question.includes('printer receive'));
const embedItemKDP = assessmentKDP.paperbackChecklist.find(c => c.question.includes('embedded in the PDF'));

if (!printerItemKDP.note.includes('Amazon KDP') && !printerItemKDP.note.includes('IngramSpark')) {
  console.error(`FAIL: Expected KDP/IngramSpark specific advice for publishing production method.`);
  process.exit(1);
}
if (!embedItemKDP.status.includes('Required')) {
  console.error(`FAIL: Expected PDF embedding to be marked as Required for publishing portals.`);
  process.exit(1);
}
console.log('PASS: KDP / IngramSpark publishing platform workflow verified.');

// 7. Test newly added book fonts: EB Garamond, Minion Pro, Times New Roman, Libre Baskerville
const newFontFamilies = ['EB Garamond', 'Minion Pro', 'Times New Roman', 'Libre Baskerville'];
newFontFamilies.forEach(fam => {
  const m = db.matchFont({ family: fam });
  if (m.length === 0 || m[0].font.family !== fam) {
    console.error(`FAIL: Newly seeded font "${fam}" could not be matched.`);
    process.exit(1);
  }
});
console.log('PASS: All 4 newly seeded book publishing fonts matched successfully.');

// 8. Test printer receipt warning for "send-source" production method
const projectSendSource = {
  useCases: ['Paperback / printed book'],
  commercial: true,
  productionMethod: 'send-source' // sending raw font files
};

const assessmentSendSource = evaluateLicense(projectSendSource, targetClauses);
const isPrinterBlocked = assessmentSendSource.paperbackChecklist.find(c => c.question.includes('printer receive'));
if (isPrinterBlocked.status !== '❌ Prohibited') {
  console.error(`FAIL: Expected printer receipt to be Prohibited for send-source production method.`);
  process.exit(1);
}
console.log('PASS: Send source raw font redistribution prohibited check verified.');

console.log('--- ALL BACKEND VERIFICATIONS COMPLETED SUCCESSFULLY ---');
