// Rules engine to assess font licenses based on project profile and license clauses

export function evaluateLicense(project, clauses) {
  const { useCases = [], commercial = true, productionMethod = 'unknown' } = project;
  
  // 1. Build a map of category -> clause for easy lookup
  const clauseMap = {};
  clauses.forEach(c => {
    // Map standard database categories to normalized lowercase keys
    const normCategory = c.category.toLowerCase().trim();
    clauseMap[normCategory] = c;
  });

  // Helper to determine status for an area
  function checkArea(clauseKey, defaultStatus = 'Not specified') {
    const clause = clauseMap[clauseKey];
    if (!clause) return { status: defaultStatus, clause: null };
    return { status: clause.status, clause };
  }

  // 2. Build the Restrictions Table
  const restrictionsTable = [];

  // Define the standard restriction rows to evaluate
  const restrictionAreas = [
    { key: 'commercial print', label: 'Commercial print' },
    { key: 'paperback', label: 'Paperback' },
    { key: 'commercial sale', label: 'Commercial sale' },
    { key: 'print-run limit', label: 'Print-run limit', default: 'No limitation found' },
    { key: 'cover', label: 'Book cover' },
    { key: 'interior', label: 'Interior typesetting' },
    { key: 'ebook', label: 'Ebook' },
    { key: 'font redistribution', label: 'Font redistribution' },
    { key: 'adult / sexual content', label: 'Adult / sexual content' },
    { key: 'political', label: 'Political content' },
    { key: 'modification', label: 'Modification' }
  ];

  restrictionAreas.forEach(area => {
    const { status, clause } = checkArea(area.key, area.default);
    
    // Create contextual interpretation based on project selection
    let explanation = '';
    if (status === 'Allowed') {
      explanation = `The license explicitly permits this use.`;
    } else if (status === 'Prohibited') {
      explanation = `The license explicitly bans this use.`;
    } else if (status === 'Restricted') {
      explanation = `Permitted subject to specific terms or conditions outlined in the EULA.`;
    } else if (status === 'No limitation found') {
      explanation = `No restrictions on volume or runs were found in the EULA.`;
    } else if (status === 'Not specified') {
      explanation = `No relevant provision was found in the identified license terms. This has not been established as permitted or prohibited.`;
    } else if (status === 'Conflicting') {
      explanation = `Multiple licensing sources contain contradictory terms for this category.`;
    } else {
      explanation = `License status for this category could not be reliably established.`;
    }

    // Specific context overrides for interpretation
    if (area.key === 'font redistribution') {
      if (status === 'Prohibited') {
        explanation = `You cannot share the .otf/.ttf file itself. You must export documents (like PDFs) with embedded fonts.`;
      } else if (status === 'Restricted') {
        explanation = `Redistribution is allowed only under specific conditions (e.g. bundled with software or sharing only with a printer).`;
      }
    } else if (area.key === 'ebook') {
      if (status === 'Restricted' || status === 'Prohibited') {
        explanation = `Requires a separate licensing tier or embedding license. Standard desktop license is insufficient.`;
      }
    } else if (area.key === 'adult / sexual content') {
      if (status === 'Restricted' || status === 'Prohibited') {
        explanation = `Foundry bans or restricts usage in adult materials or pornography.`;
      }
    } else if (area.key === 'immoral use') {
      if (status === 'Restricted' || status === 'Prohibited') {
        explanation = `Broad morality clause detected. Foundry restricts uses deemed immoral, offensive, or harmful to reputation. Subjective clause with medium interpretation confidence.`;
      }
    }

    restrictionsTable.push({
      area: area.label,
      categoryKey: area.key,
      status: status,
      clauseId: clause ? clause.clause_id : null,
      text: clause ? clause.text : 'No relevant clause specified.',
      section: clause ? clause.section : 'Not specified',
      explanation: explanation
    });
  });

  // Check additional ethical/moral categories for the sidebar or extra items
  const ethicalCategories = [
    'obscene content', 'hate / discrimination', 'extremism', 'violence', 
    'illegal activity', 'drugs', 'weapons', 'gambling', 'religious', 
    'defamation', 'harassment', 'immoral use', 'reputation', 'endorsement', 
    'sensitive subjects'
  ];

  ethicalCategories.forEach(cat => {
    const clause = clauseMap[cat];
    if (clause && (clause.status === 'Prohibited' || clause.status === 'Restricted')) {
      restrictionsTable.push({
        area: cat.charAt(0).toUpperCase() + cat.slice(1),
        categoryKey: cat,
        status: clause.status,
        clauseId: clause.clause_id,
        text: clause.text,
        section: clause.section,
        explanation: `Custom EULA constraint: ${clause.status.toLowerCase()} usage detected.`
      });
    }
  });

  // 3. Determine Overall Status
  // Let's look at the selected use cases.
  // We check the statuses of the selected use cases in the restrictionsTable.
  let overallStatus = 'Allowed';
  let overallDescription = 'Commercial print use is permitted under the identified license.';
  
  const activeStatuses = [];

  // Check general commercial print status first
  const printStatus = checkArea('commercial print').status;
  const redistributionStatus = checkArea('font redistribution').status;

  useCases.forEach(use => {
    let checkKey = '';
    if (use === 'Paperback / printed book') checkKey = 'paperback';
    else if (use === 'Hardcover') checkKey = 'commercial print'; // fallback
    else if (use === 'Ebook') checkKey = 'ebook';
    else if (use === 'Website') checkKey = 'website';
    else if (use === 'App / software') checkKey = 'app / software';
    else if (use === 'Logo / branding') checkKey = 'cover'; // fallback to graphic artwork
    else if (use === 'Packaging') checkKey = 'packaging';
    else if (use === 'Merchandise') checkKey = 'merchandise';
    else if (use === 'Advertising') checkKey = 'advertising';
    else if (use === 'Social media') checkKey = 'social media';
    
    if (checkKey) {
      const areaStatus = checkArea(checkKey).status;
      if (areaStatus !== 'Not specified' && areaStatus !== 'No limitation found') {
        activeStatuses.push(areaStatus);
      }
    }
  });

  // Check general content restrictions
  const adultStatus = checkArea('adult / sexual content').status;
  if (adultStatus === 'Prohibited' || adultStatus === 'Restricted') {
    activeStatuses.push(adultStatus);
  }

  // Calculate overall status based on highest severity
  if (activeStatuses.includes('Prohibited')) {
    overallStatus = 'Prohibited';
    overallDescription = 'This font cannot be used for your project under the current license terms.';
  } else if (activeStatuses.includes('Restricted')) {
    overallStatus = 'Restricted';
    overallDescription = 'This font is permitted for use, but important licensing restrictions apply.';
  } else if (activeStatuses.includes('Conflicting')) {
    overallStatus = 'Conflicting';
    overallDescription = 'Multiple sources contain contradictory terms. Manual review required.';
  } else if (activeStatuses.includes('Unknown') || printStatus === 'Unknown') {
    overallStatus = 'Unknown';
    overallDescription = 'License terms could not be established. Usage is high risk.';
  } else if (printStatus === 'Prohibited' && (useCases.includes('Paperback / printed book') || useCases.includes('Hardcover'))) {
    overallStatus = 'Prohibited';
    overallDescription = 'Commercial print usage is prohibited under the identified license.';
  } else {
    overallStatus = 'Allowed';
    overallDescription = 'Your selected uses are permitted under the identified license.';
  }

  // 4. Paperback Checklist (Specific for authors)
  let paperbackChecklist = null;
  
  if (useCases.includes('Paperback / printed book')) {
    paperbackChecklist = [];

    // Helper to add checklist item
    const addCheckItem = (question, status, note, key = null) => {
      const clause = key ? clauseMap[key] : null;
      paperbackChecklist.push({
        question,
        status, // '✅' (Allowed), '❌' (Prohibited), '⚠️' (Warning/Action Required), 'Not specified'
        note,
        clauseId: clause ? clause.clause_id : null
      });
    };

    // Q1: Commercial Use?
    const commPrint = checkArea('commercial print');
    if (commPrint.status === 'Allowed') {
      addCheckItem('Can the font be used commercially?', '✅', 'Explicitly allowed for commercial publications.', 'commercial print');
    } else if (commPrint.status === 'Prohibited') {
      addCheckItem('Can the font be used commercially?', '❌', 'Commercial use of this font is banned.', 'commercial print');
    } else {
      addCheckItem('Can the font be used commercially?', '⚠️', 'No explicit commercial permission found in EULA.', 'commercial print');
    }

    // Q2: Printed books?
    const pbUse = checkArea('paperback');
    if (pbUse.status === 'Allowed') {
      addCheckItem('Can it be used in printed books?', '✅', 'Direct permission for books/publishing.', 'paperback');
    } else if (pbUse.status === 'Prohibited') {
      addCheckItem('Can it be used in printed books?', '❌', 'Banned in printed publications.', 'paperback');
    } else {
      // Fallback to commercial print
      if (commPrint.status === 'Allowed') {
        addCheckItem('Can it be used in printed books?', '✅', 'Covered under general print permissions.', 'commercial print');
      } else {
        addCheckItem('Can it be used in printed books?', '⚠️', 'Not specified. Proceed with caution.', 'paperback');
      }
    }

    // Q3: Sold commercially?
    const commSale = checkArea('commercial sale');
    if (commSale.status === 'Allowed') {
      addCheckItem('Can books be sold commercially?', '✅', 'Commercial sales of publications are allowed.', 'commercial sale');
    } else if (commSale.status === 'Prohibited') {
      addCheckItem('Can books be sold commercially?', '❌', 'Banned for products intended for sale.', 'commercial sale');
    } else {
      addCheckItem('Can books be sold commercially?', '✅', 'Generally allowed as part of commercial print license.', 'commercial print');
    }

    // Q4: Print-run limit?
    const printRun = checkArea('print-run limit');
    if (printRun.status === 'Restricted') {
      addCheckItem('Is there a print-run limit?', '⚠️', `Limit applies: ${printRun.clause.text}`, 'print-run limit');
    } else {
      addCheckItem('Is there a print-run limit?', '✅', 'No copies/volume limitations found in EULA.', 'print-run limit');
    }

    // Q5: Cover?
    const coverUse = checkArea('cover');
    if (coverUse.status === 'Allowed') {
      addCheckItem('Can it be used for the cover?', '✅', 'Permitted for graphics and cover art.', 'cover');
    } else if (coverUse.status === 'Prohibited') {
      addCheckItem('Can it be used for the cover?', '❌', 'Prohibited for branding/cover applications.', 'cover');
    } else {
      addCheckItem('Can it be used for the cover?', '✅', 'Allowed as part of design/artwork generation.', 'commercial print');
    }

    // Q6: Interior text?
    const interiorUse = checkArea('interior');
    if (interiorUse.status === 'Allowed') {
      addCheckItem('Can it be used for interior text?', '✅', 'Permitted for interior typesetting.', 'interior');
    } else if (interiorUse.status === 'Prohibited') {
      addCheckItem('Can it be used for interior text?', '❌', 'Prohibited for typesetting body text.', 'interior');
    } else {
      addCheckItem('Can it be used for interior text?', '✅', 'Allowed under general typesetting rules.', 'commercial print');
    }

    // Q7: PDF generated?
    addCheckItem('Can a PDF be generated?', '✅', 'Standard document generation is allowed for layout proofing.', 'commercial print');

    // Q8 & Q9: Printer / PDF distribution issues
    // Let's check production method
    if (productionMethod === 'export-pdf') {
      addCheckItem('Can the printer receive the font?', '✅', 'Allowed. You are exporting a static PDF and not sending raw font files.', 'font redistribution');
      addCheckItem('Can the font be embedded in the PDF?', '✅', 'Allowed for static distribution/viewing.', 'font redistribution');
    } else if (productionMethod === 'send-pdf') {
      addCheckItem('Can the printer receive the font?', '✅', 'Allowed. Printer receives static PDF, which does not require font installation.', 'font redistribution');
      addCheckItem('Can the font be embedded in the PDF?', '⚠️ Check', 'Most licenses permit embedding for print and preview, but verify embedding settings (Subset only).', 'font redistribution');
    } else if (productionMethod === 'publishing') {
      addCheckItem('Can the printer receive the font?', '✅', 'Allowed. Uploading a print-ready interior PDF to Amazon KDP, IngramSpark, or Barnes & Noble Press does not transfer font software.', 'font redistribution');
      addCheckItem('Can the font be embedded in the PDF?', '✅ Required', 'Allowed. Publishing portals require fonts to be fully embedded as static vector subsets in your uploaded PDF.', 'font redistribution');
    } else if (productionMethod === 'send-source') {
      if (redistributionStatus === 'Prohibited') {
        addCheckItem('Can the printer receive the font?', '❌ Prohibited', 'WARNING: Sharing the font files (.otf/.ttf) with your printer is prohibited. You must supply a flattened PDF instead.', 'font redistribution');
        addCheckItem('Can the font be embedded in the PDF?', '⚠️ Check', 'Embedding in PDF is allowed, but font files must not be extractable.', 'font redistribution');
      } else {
        addCheckItem('Can the printer receive the font?', '⚠️ Check', 'Verify if printer holds a separate license. Some foundries require printers to purchase a copy.', 'font redistribution');
        addCheckItem('Can the font be embedded in the PDF?', '✅', 'Permitted for distribution to printing houses.', 'font redistribution');
      }
    } else {
      addCheckItem('Can the printer receive the font?', '⚠️ Check', 'Depends on distribution format. Avoid sending source files if redistribution is restricted.', 'font redistribution');
      addCheckItem('Can the font be embedded in the PDF?', '⚠️ Check', 'Check EULA embedding permissions (Print & Preview only).', 'font redistribution');
    }

    // Q10: Additional license required?
    const ebookUse = checkArea('ebook');
    if (useCases.includes('Ebook') && (ebookUse.status === 'Restricted' || ebookUse.status === 'Prohibited')) {
      addCheckItem('Is an additional license required?', '⚠️ Yes', 'Ebook licensing is separate from print. An EPUB license is required.', 'ebook');
    } else {
      addCheckItem('Is an additional license required?', '✅ No', 'Desktop/Print license is sufficient for paperback production.', 'commercial print');
    }

    // Q11: Geographic restrictions?
    const geo = checkArea('geography');
    if (geo.status === 'Restricted') {
      addCheckItem('Geographic restriction?', '⚠️ Yes', `Restricted to: ${geo.clause.text}`, 'geography');
    } else {
      addCheckItem('Geographic restriction?', '✅ None', 'No geographic distribution boundaries found.', null);
    }

    // Q12: Content restrictions?
    const contentCategories = [
      { key: 'adult / sexual content', label: 'Adult/Sexual content' },
      { key: 'political', label: 'Political content' },
      { key: 'immoral use', label: 'Broad morality clause' },
      { key: 'obscene content', label: 'Obscene material' },
      { key: 'hate / discrimination', label: 'Hate speech/discrimination' },
      { key: 'violence', label: 'Graphic violence' },
      { key: 'religious', label: 'Religious restrictions' },
      { key: 'defamation', label: 'Defamatory use' },
      { key: 'drugs', label: 'Illegal drugs' },
      { key: 'weapons', label: 'Weapons promotion' }
    ];

    let contentRestrictionsCount = 0;
    let contentNotes = [];
    contentCategories.forEach(item => {
      const cat = checkArea(item.key);
      if (cat.status === 'Prohibited' || cat.status === 'Restricted') {
        contentRestrictionsCount++;
        contentNotes.push(`${item.label} (${cat.status.toLowerCase()})`);
      }
    });

    if (contentRestrictionsCount > 0) {
      addCheckItem('Content restrictions?', '⚠️ Yes', `${contentRestrictionsCount} content restriction(s) found: ${contentNotes.join(', ')}.`, 'adult / sexual content');
    } else {
      addCheckItem('Content restrictions?', '✅ None', 'No ethical or moral content bans detected.', null);
    }
  }

  return {
    overallStatus,
    overallDescription,
    restrictionsTable,
    paperbackChecklist
  };
}
