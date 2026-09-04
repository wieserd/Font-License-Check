import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Standard categories to look for in EULAs
const CATEGORIES = [
  'Commercial print',
  'Paperback',
  'Commercial sale',
  'Print-run limit',
  'Cover',
  'Interior',
  'Ebook',
  'Font redistribution',
  'Adult / sexual content',
  'Political',
  'Modification'
];

export async function analyzeEulaText(eulaText, apiKey = null) {
  const activeKey = apiKey || process.env.GEMINI_API_KEY;

  if (!activeKey) {
    console.warn('GEMINI_API_KEY not found. Running local rule-based heuristic parsing fallback.');
    return heuristicMockParser(eulaText);
  }

  try {
    const genAI = new GoogleGenerativeAI(activeKey);
    
    const systemInstruction = `
You are a legal document information extraction agent specializing in Font End User License Agreements (EULAs).
Your task is to analyze the provided EULA text and extract facts relating to specific usage categories.

You MUST extract terms for the following categories:
${CATEGORIES.map(c => `- "${c}"`).join('\n')}

For each category, determine:
1. "status": Must be exactly one of: "Allowed", "Restricted", "Prohibited", "Not specified".
   - "Allowed": License explicitly permits this use.
   - "Restricted": Permitted only under certain conditions, limits, or with warnings.
   - "Prohibited": Explicitly banned.
   - "Not specified": The license text does not mention this use case.
2. "text": The EXACT quote from the EULA containing this rule. If status is "Not specified", leave this empty.
3. "section": The section title, number, or clause number where this is found (e.g. "Section 2.1" or "Clause 4(a)").
4. "confidence": "High", "Medium", or "Low" based on how clear and unambiguous the clause is.

Output your response as a valid JSON array of objects with this schema:
[
  {
    "category": "Category Name",
    "status": "Allowed | Restricted | Prohibited | Not specified",
    "text": "Exact quote from EULA",
    "section": "Section name/number",
    "confidence": "High | Medium | Low"
  }
]

Do not invent facts. Only extract information directly stated or clearly implied by the EULA text.
If a category is not mentioned in the text, mark its status as "Not specified" and text/section as "".
`;

    // Using gemini-1.5-flash which is widely compatible and fast
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const prompt = `Analyze this EULA text:\n\n${eulaText}`;
    
    const result = await model.generateContent(prompt);

    const responseText = result.response.text();
    const clauses = JSON.parse(responseText.trim());
    return clauses;
  } catch (error) {
    console.error('Error in Gemini API EULA analysis:', error);
    // Return fallback in case of API failure or JSON parse errors
    return heuristicMockParser(eulaText);
  }
}


// Heuristic keyword-matching parser as a fallback
function heuristicMockParser(text) {
  const clauses = [];
  const lines = text.split('\n');

  // Helper to find keyword line
  const findLineWithKeywords = (keywords) => {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.every(kw => lower.includes(kw))) {
        return line.trim();
      }
    }
    // Fallback to searching any of the keywords
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw) && line.length > 20) {
          return line.trim();
        }
      }
    }
    return null;
  };

  // 1. Commercial print & Paperback
  const printQuote = findLineWithKeywords(['print', 'commercial']) || findLineWithKeywords(['publish', 'book']);
  if (printQuote) {
    let status = 'Allowed';
    if (printQuote.toLowerCase().includes('prohibit') || printQuote.toLowerCase().includes('not allow')) {
      status = 'Prohibited';
    } else if (printQuote.toLowerCase().includes('restrict') || printQuote.toLowerCase().includes('limit')) {
      status = 'Restricted';
    }
    clauses.push({
      category: 'Commercial print',
      status,
      text: printQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
    clauses.push({
      category: 'Paperback',
      status,
      text: printQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
  } else {
    clauses.push({ category: 'Commercial print', status: 'Not specified', text: '', section: '', confidence: 'Low' });
    clauses.push({ category: 'Paperback', status: 'Not specified', text: '', section: '', confidence: 'Low' });
  }

  // 2. Ebook
  const ebookQuote = findLineWithKeywords(['ebook']) || findLineWithKeywords(['epub']) || findLineWithKeywords(['electronic publication']);
  if (ebookQuote) {
    let status = 'Restricted';
    if (ebookQuote.toLowerCase().includes('prohibit') || ebookQuote.toLowerCase().includes('not permit')) {
      status = 'Prohibited';
    } else if (ebookQuote.toLowerCase().includes('allow') && !ebookQuote.toLowerCase().includes('requires separate')) {
      status = 'Allowed';
    }
    clauses.push({
      category: 'Ebook',
      status,
      text: ebookQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
  } else {
    clauses.push({ category: 'Ebook', status: 'Not specified', text: '', section: '', confidence: 'Low' });
  }

  // 3. Redistribution
  const redistQuote = findLineWithKeywords(['redistribute']) || findLineWithKeywords(['distribute', 'font file']) || findLineWithKeywords(['transfer', 'license']);
  if (redistQuote) {
    let status = 'Prohibited';
    if (redistQuote.toLowerCase().includes('allow') || redistQuote.toLowerCase().includes('permit')) {
      status = 'Allowed';
      if (redistQuote.toLowerCase().includes('condition') || redistQuote.toLowerCase().includes('only')) {
        status = 'Restricted';
      }
    }
    clauses.push({
      category: 'Font redistribution',
      status,
      text: redistQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
  } else {
    clauses.push({
      category: 'Font redistribution',
      status: 'Prohibited',
      text: 'You may not distribute, share, or transfer the Font Software files to third parties.',
      section: 'Standard Restriction (Inferred)',
      confidence: 'Medium'
    });
  }

  // 4. Adult content
  const adultQuote = findLineWithKeywords(['porn']) || findLineWithKeywords(['adult']) || findLineWithKeywords(['obscene']) || findLineWithKeywords(['decency']);
  if (adultQuote) {
    clauses.push({
      category: 'Adult / sexual content',
      status: 'Prohibited',
      text: adultQuote,
      section: 'Detected Clause',
      confidence: 'High'
    });
  } else {
    clauses.push({ category: 'Adult / sexual content', status: 'Not specified', text: '', section: '', confidence: 'Low' });
  }

  // 5. Political
  const politicalQuote = findLineWithKeywords(['political']) || findLineWithKeywords(['campaign']) || findLineWithKeywords(['lobby']);
  if (politicalQuote) {
    clauses.push({
      category: 'Political',
      status: 'Restricted',
      text: politicalQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
  } else {
    clauses.push({ category: 'Political', status: 'Not specified', text: '', section: '', confidence: 'Low' });
  }

  // 6. Modification
  const modifyQuote = findLineWithKeywords(['modify']) || findLineWithKeywords(['alter']) || findLineWithKeywords(['derivative']);
  if (modifyQuote) {
    let status = 'Prohibited';
    if (modifyQuote.toLowerCase().includes('allow') || modifyQuote.toLowerCase().includes('permit')) {
      status = 'Allowed';
    }
    clauses.push({
      category: 'Modification',
      status,
      text: modifyQuote,
      section: 'Detected Clause',
      confidence: 'Medium'
    });
  } else {
    clauses.push({ category: 'Modification', status: 'Not specified', text: '', section: '', confidence: 'Low' });
  }

  // Fill in other default categories if missing
  const populatedCategories = clauses.map(c => c.category);
  CATEGORIES.forEach(cat => {
    if (!populatedCategories.includes(cat)) {
      clauses.push({
        category: cat,
        status: 'Not specified',
        text: '',
        section: '',
        confidence: 'Low'
      });
    }
  });

  return clauses;
}
