import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { db } from './db.js';
import { evaluateLicense } from './licenseEngine.js';
import { analyzeEulaText } from './geminiService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static assets if in production
// Express will serve build artifacts if we build the client
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// API Endpoints

/**
 * @route GET /api/fonts
 * @description Retrieve all fonts stored in the local registry database
 * @returns {Array<Object>} List of fonts
 */
app.get('/api/fonts', (req, res) => {
  try {
    const fonts = db.getFonts();
    res.json(fonts);
  } catch (error) {
    console.error('Error retrieving fonts:', error);
    res.status(500).json({ error: 'Failed to retrieve fonts' });
  }
});

/**
 * @route POST /api/identify
 * @description Match a font based on query search or extracted metadata fields
 * @param {Object} req.body - Font metadata or name query
 * @returns {Object} candidates - Sorted list of candidate matches and scores
 */
app.post('/api/identify', (req, res) => {
  try {
    const metadata = req.body;
    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'Invalid metadata payload structure' });
    }
    
    // If it's a simple search by name
    if (metadata.nameQuery) {
      const query = metadata.nameQuery.toLowerCase().trim();
      if (!query) {
        return res.status(400).json({ error: 'Name query cannot be empty' });
      }
      
      const allFonts = db.getFonts();
      
      const candidates = allFonts.map(font => {
        let score = 0;
        const reasons = [];
        
        if (font.family.toLowerCase() === query) {
          score += 50;
          reasons.push('Exact family name match');
        } else if (font.family.toLowerCase().includes(query) || query.includes(font.family.toLowerCase())) {
          score += 30;
          reasons.push('Partial family name match');
        }
        
        if (font.postscript_name && (font.postscript_name.toLowerCase() === query || font.postscript_name.toLowerCase().includes(query))) {
          score += 25;
          reasons.push('PostScript name match');
        }

        return { font, score, reasons };
      }).filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

      return res.json({ candidates });
    }

    // Otherwise, match uploaded metadata from opentype.js
    const candidates = db.matchFont(metadata);
    res.json({ candidates });
  } catch (error) {
    console.error('Error identifying font:', error);
    res.status(500).json({ error: 'Failed to identify font' });
  }
});

/**
 * @route POST /api/analyze
 * @description Run the rules engine to check project use parameters against a registry EULA
 * @param {string} req.body.fontId - Registered Font Identifier
 * @param {Object} req.body.project - Intended usage configuration
 * @param {boolean} [req.body.saveToHistory=false] - Whether to save result to user library history
 */
app.post('/api/analyze', (req, res) => {
  try {
    const { fontId, project, saveToHistory = false } = req.body;

    if (!fontId) {
      return res.status(400).json({ error: 'Missing required field: fontId' });
    }
    if (!project || typeof project !== 'object' || !Array.isArray(project.useCases)) {
      return res.status(400).json({ error: 'Invalid or missing project profile configuration' });
    }

    const fonts = db.getFonts();
    const licenses = db.getLicenses();
    const clauses = db.getClauses();

    const font = fonts.find(f => f.font_id === fontId);
    if (!font) {
      return res.status(404).json({ error: 'Font not found in registry' });
    }

    const license = licenses.find(l => l.font_id === fontId);
    if (!license) {
      return res.json({
        font,
        license: null,
        assessment: {
          overallStatus: 'Unknown',
          overallDescription: 'The license terms for this font could not be located in the registry.',
          restrictionsTable: [],
          paperbackChecklist: null
        }
      });
    }

    const fontClauses = clauses.filter(c => c.license_id === license.license_id);
    const evaluation = evaluateLicense(project, fontClauses);

    // Save to history if specified
    if (saveToHistory) {
      db.saveHistory({
        font_name: font.family,
        family: font.family,
        postscript_name: font.postscript_name,
        project_types: project.useCases,
        production_method: project.productionMethod || 'unknown',
        overall_status: evaluation.overallStatus
      });
    }

    res.json({
      font,
      license,
      assessment: evaluation
    });
  } catch (error) {
    console.error('Error analyzing license:', error);
    res.status(500).json({ error: 'Failed to analyze license' });
  }
});

/**
 * @route POST /api/custom-license
 * @description Parse a custom pasted EULA text using Gemini API or regex fallback, then register the custom font
 * @param {Object} req.body.fontMetadata - Custom font details
 * @param {string} req.body.eulaText - Paste plain text EULA document
 * @param {string} [req.body.licenseName] - Custom license name/version
 * @param {string} [req.body.sourceUrl] - Sourced URL reference
 * @param {Object} req.body.project - Intended usage configuration
 * @param {boolean} [req.body.saveToHistory=false] - Whether to save result to user library history
 */
app.post('/api/custom-license', async (req, res) => {
  try {
    const { fontMetadata, eulaText, licenseName, sourceUrl, project, saveToHistory = false } = req.body;

    if (!fontMetadata || typeof fontMetadata !== 'object') {
      return res.status(400).json({ error: 'Missing fontMetadata configuration' });
    }
    if (!eulaText || eulaText.trim().length === 0) {
      return res.status(400).json({ error: 'EULA text is required for analysis' });
    }
    if (!project || typeof project !== 'object' || !Array.isArray(project.useCases)) {
      return res.status(400).json({ error: 'Invalid or missing project profile configuration' });
    }

    console.log(`Analyzing custom EULA for font: ${fontMetadata.family || 'Unknown'}`);
    
    // 1. Analyze EULA using Gemini or fallback
    const clauses = await analyzeEulaText(eulaText);

    // 2. Format details to register font and license
    const newFontData = {
      family: fontMetadata.family || 'Custom Font',
      subfamily: fontMetadata.subfamily || 'Regular',
      postscript_name: fontMetadata.postscript_name || fontMetadata.family || `custom-${Date.now()}`,
      foundry: fontMetadata.foundry || 'Custom/Self-Published',
      designer: fontMetadata.designer || 'Unknown',
      vendor_id: fontMetadata.vendor_id || 'CUST',
      version: fontMetadata.version || '1.0'
    };

    const newLicenseData = {
      license_name: licenseName || 'Analyzed EULA',
      license_type: 'Custom EULA',
      source_url: sourceUrl || 'User Paste',
      source_type: 'Primary',
      effective_date: new Date().toISOString().split('T')[0],
      confidence: process.env.GEMINI_API_KEY ? 'High' : 'Medium'
    };

    // 3. Write custom font, license and clauses to database
    const saved = db.addCustomFontAndLicense({
      font: newFontData,
      license: newLicenseData,
      clauses: clauses
    });

    // 4. Evaluate the new license against the project requirements
    const evaluation = evaluateLicense(project, saved.clauses);

    // 5. Save to history if specified
    if (saveToHistory) {
      db.saveHistory({
        font_name: saved.font.family,
        family: saved.font.family,
        postscript_name: saved.font.postscript_name,
        project_types: project.useCases,
        production_method: project.productionMethod || 'unknown',
        overall_status: evaluation.overallStatus
      });
    }

    res.json({
      font: saved.font,
      license: saved.license,
      assessment: evaluation
    });
  } catch (error) {
    console.error('Error analyzing custom license:', error);
    res.status(500).json({ error: 'Failed to process custom license analysis' });
  }
});

/**
 * @route GET /api/history
 * @description Retrieve user's saved font library history audits
 */
app.get('/api/history', (req, res) => {
  try {
    const history = db.getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error retrieving library history:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

/**
 * @route DELETE /api/history/:id
 * @description Delete a saved audit from the library history
 */
app.delete('/api/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Audit ID parameter is required' });
    }
    
    const deleted = db.deleteHistory(id);
    if (deleted) {
      res.json({ success: true, message: 'Audit history deleted' });
    } else {
      res.status(404).json({ error: 'Audit history not found' });
    }
  } catch (error) {
    console.error('Error deleting library history:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

/**
 * @route PATCH /api/history/:id/monitor
 * @description Toggle or update license monitoring status for a saved font
 */
app.patch('/api/history/:id/monitor', (req, res) => {
  try {
    const { id } = req.params;
    const { monitored } = req.body;
    if (monitored === undefined) {
      return res.status(400).json({ error: 'monitored boolean parameter is required' });
    }
    const updated = db.updateHistoryMonitoring(id, monitored);
    if (updated) {
      res.json({ success: true, item: updated });
    } else {
      res.status(404).json({ error: 'Audit history item not found' });
    }
  } catch (error) {
    console.error('Error updating monitoring status:', error);
    res.status(500).json({ error: 'Failed to update monitoring status' });
  }
});

/**
 * @route POST /api/check-updates
 * @description Checks if monitored licenses have changed since the last check
 * @param {Array<string>} req.body.fontIds - List of font ids to check
 */
app.post('/api/check-updates', (req, res) => {
  try {
    const { fontIds = [] } = req.body;
    if (!Array.isArray(fontIds)) {
      return res.status(400).json({ error: 'fontIds must be an array of strings' });
    }
    
    const licenses = db.getLicenses();
    const fonts = db.getFonts();
    const updates = [];

    fontIds.forEach(id => {
      const font = fonts.find(f => f.font_id === id);
      const lic = licenses.find(l => l.font_id === id);
      
      if (font && lic) {
        // Simulate EULA modification alert for demonstration (randomized 25% chance)
        const shouldUpdate = req.body.simulateUpdate === id || (Math.random() < 0.25);
        if (shouldUpdate) {
          updates.push({
            font_id: id,
            family: font.family,
            old_version: lic.effective_date,
            new_version: new Date().toISOString().split('T')[0],
            message: `The license for ${font.family} has been updated. Commercial print run limits or redistribution restrictions may have changed.`
          });
        }
      }
    });

    res.json({ updates });
  } catch (error) {
    console.error('Error checking monitored updates:', error);
    res.status(500).json({ error: 'Failed to run license check' });
  }
});

// Serve frontend SPA for all other requests (Vite SPA fallback routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
