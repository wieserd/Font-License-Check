import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'database.json');

// Helper to read database
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { fonts: [], licenses: [], license_clauses: [], history: [] };
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database file:', error);
    return { fonts: [], licenses: [], license_clauses: [], history: [] };
  }
}

// Helper to write database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing database file:', error);
    return false;
  }
}

export const db = {
  getFonts() {
    return readDB().fonts;
  },

  getLicenses() {
    return readDB().licenses;
  },

  getClauses() {
    return readDB().license_clauses;
  },

  getHistory() {
    return readDB().history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  saveHistory(entry) {
    const data = readDB();
    const newEntry = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      monitored: entry.monitored !== undefined ? entry.monitored : true,
      license_version: entry.license_version || '1.0',
      document_hash: entry.document_hash || '',
      checked_date: entry.checked_date || new Date().toISOString().split('T')[0],
      ...entry
    };
    data.history.push(newEntry);
    writeDB(data);
    return newEntry;
  },

  updateHistoryMonitoring(id, monitored) {
    const data = readDB();
    const item = data.history.find(h => h.id === id);
    if (item) {
      item.monitored = Boolean(monitored);
      writeDB(data);
      return item;
    }
    return null;
  },

  deleteHistory(id) {
    const data = readDB();
    const originalLength = data.history.length;
    data.history = data.history.filter(h => h.id !== id);
    writeDB(data);
    return data.history.length < originalLength;
  },

  addCustomFontAndLicense({ font, license, clauses }) {
    const data = readDB();

    // Check if font already exists (matching postscript name)
    let existingFont = data.fonts.find(f => 
      f.postscript_name && font.postscript_name && 
      f.postscript_name.toLowerCase() === font.postscript_name.toLowerCase()
    );

    if (!existingFont) {
      existingFont = data.fonts.find(f => 
        f.family.toLowerCase() === font.family.toLowerCase() && 
        f.subfamily.toLowerCase() === font.subfamily.toLowerCase()
      );
    }

    const fontId = existingFont ? existingFont.font_id : `font-${Date.now()}`;
    
    if (!existingFont) {
      const newFont = {
        font_id: fontId,
        family: font.family || 'Unknown Font',
        subfamily: font.subfamily || 'Regular',
        postscript_name: font.postscript_name || font.family || 'Unknown',
        foundry: font.foundry || 'Unknown Foundry',
        designer: font.designer || 'Unknown Designer',
        vendor_id: font.vendor_id || 'UKWN',
        version: font.version || '1.0'
      };
      data.fonts.push(newFont);
    }

    // Now insert/overwrite license
    const licenseId = `lic-${Date.now()}`;
    const newLicense = {
      license_id: licenseId,
      font_id: fontId,
      license_name: license.license_name || 'Custom License Agreement',
      license_type: license.license_type || 'Custom EULA',
      source_url: license.source_url || 'User Uploaded Text',
      source_type: license.source_type || 'Primary',
      effective_date: license.effective_date || new Date().toISOString().split('T')[0],
      retrieved_at: new Date().toISOString().split('T')[0],
      document_hash: license.document_hash || Math.random().toString(36).substring(2, 15),
      confidence: license.confidence || 'Medium'
    };

    // Remove any previous custom licenses for this font if we want to update it
    data.licenses = data.licenses.filter(l => l.font_id !== fontId);
    data.licenses.push(newLicense);

    // Remove old clauses for this license or this font
    const oldLicenseIds = data.licenses.filter(l => l.font_id === fontId).map(l => l.license_id);
    data.license_clauses = data.license_clauses.filter(c => !oldLicenseIds.includes(c.license_id));

    // Add new clauses
    clauses.forEach((c, idx) => {
      data.license_clauses.push({
        clause_id: `cl-${Date.now()}-${idx}`,
        license_id: licenseId,
        category: c.category,
        status: c.status,
        text: c.text,
        section: c.section || 'Unspecified',
        confidence: c.confidence || 'Medium'
      });
    });

    writeDB(data);

    return {
      fontId,
      licenseId,
      font: data.fonts.find(f => f.font_id === fontId),
      license: newLicense,
      clauses: data.license_clauses.filter(c => c.license_id === licenseId)
    };
  },

  matchFont(metadata) {
    const data = readDB();
    const { 
      family, 
      subfamily, 
      postscript_name, 
      vendor_id, 
      designer, 
      foundry, 
      manufacturer, 
      copyright,
      filename 
    } = metadata;

    const cleanStr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Clean filename if provided (e.g. 'GaramondPro-Regular-FINAL2.otf' -> 'garamondpro')
    let cleanFilename = '';
    if (filename) {
      cleanFilename = filename
        .replace(/\.(otf|ttf|woff2|woff)$/i, '')
        .replace(/[-_](final|copy|v\d+|\d+|regular|bold|italic|pro|light|medium|semibold).*/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
    }

    const candidates = [];

    for (const font of data.fonts) {
      let score = 0;
      const reasons = [];

      const cleanPS = cleanStr(postscript_name);
      const fontCleanPS = cleanStr(font.postscript_name);

      // 1. Postscript name match (very high weight)
      if (cleanPS && fontCleanPS) {
        if (cleanPS === fontCleanPS) {
          score += 50;
          reasons.push('PostScript name match');
        } else if (cleanPS.includes(fontCleanPS) || fontCleanPS.includes(cleanPS)) {
          score += 25;
          reasons.push('Partial PostScript match');
        }
      }

      // 2. Font family match (high weight)
      const cleanFam = cleanStr(family);
      const fontCleanFam = cleanStr(font.family);
      if (cleanFam && fontCleanFam) {
        if (cleanFam === fontCleanFam) {
          score += 35;
          reasons.push('Exact family match');
        } else if (cleanFam.includes(fontCleanFam) || fontCleanFam.includes(cleanFam)) {
          score += 25;
          reasons.push('Family name similarity');
        }
      }

      // 3. Subfamily / Style match (medium weight)
      if (subfamily && font.subfamily && 
          subfamily.toLowerCase().trim() === font.subfamily.toLowerCase().trim()) {
        score += 10;
        reasons.push('Style match');
      }

      // 4. Vendor ID match (high weight)
      if (vendor_id && font.vendor_id && 
          vendor_id.toLowerCase().trim() === font.vendor_id.toLowerCase().trim()) {
        score += 15;
        reasons.push('Foundry Vendor ID match');
      }

      // 5. Manufacturer / Foundry match
      const mfgCandidate = (manufacturer || foundry || '').toLowerCase();
      if (mfgCandidate && font.foundry && 
          (mfgCandidate.includes(font.foundry.toLowerCase()) || font.foundry.toLowerCase().includes(mfgCandidate))) {
        score += 15;
        reasons.push('Manufacturer/Foundry match');
      }

      // 6. Designer match (medium weight)
      if (designer && font.designer && 
          (designer.toLowerCase().includes(font.designer.toLowerCase()) || 
           font.designer.toLowerCase().includes(designer.toLowerCase()))) {
        score += 10;
        reasons.push('Designer match');
      }

      // 7. Copyright match (high weight if foundry copyright detected)
      if (copyright && font.foundry && 
          copyright.toLowerCase().includes(font.foundry.toLowerCase())) {
        score += 15;
        reasons.push('Copyright foundry verification');
      }

      // 8. Filename heuristic fallback
      if (cleanFilename && fontCleanFam && 
          (fontCleanFam.includes(cleanFilename) || cleanFilename.includes(fontCleanFam))) {
        score += 10;
        reasons.push('Filename pattern match');
      }

      if (score > 15) {
        let confidence = 'Low';
        if (score >= 60) confidence = 'High';
        else if (score >= 35) confidence = 'Medium';

        candidates.push({ 
          font, 
          score, 
          confidence,
          reasons 
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }
};
