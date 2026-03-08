import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Normalize text for fuzzy matching
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ")
    .replace(/[^\w\s½¼¾⅓⅔×x]/gi, "")
    .trim();
}

// Parse fractional quantities like ½, ¼, 1½, etc.
function parseFractionalQuantity(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val).trim();

  const fractionMap: Record<string, number> = {
    "¼": 0.25, "½": 0.5, "¾": 0.75,
    "⅓": 0.333, "⅔": 0.667,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 0.167, "⅚": 0.833,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  };

  if (fractionMap[str]) return fractionMap[str];

  for (const [frac, dec] of Object.entries(fractionMap)) {
    if (str.includes(frac)) {
      const whole = parseInt(str.replace(frac, "").trim() || "0", 10);
      return whole + dec;
    }
  }

  const slashMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    const num = parseInt(slashMatch[1], 10);
    const den = parseInt(slashMatch[2], 10);
    return den !== 0 ? num / den : 0;
  }

  const mixedSlash = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedSlash) {
    const whole = parseInt(mixedSlash[1], 10);
    const num = parseInt(mixedSlash[2], 10);
    const den = parseInt(mixedSlash[3], 10);
    return den !== 0 ? whole + num / den : whole;
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isAbbreviationMatch(extracted: string, master: string): boolean {
  const extParts = extracted.split(/\s+/);
  const masterParts = master.split(/\s+/);
  let matchedParts = 0;
  for (const ep of extParts) {
    if (ep.length < 1) continue;
    for (const mp of masterParts) {
      if (mp.startsWith(ep) || ep.startsWith(mp) || mp === ep) {
        matchedParts++;
        break;
      }
    }
  }
  return extParts.length > 0 && matchedParts >= Math.ceil(extParts.length * 0.5);
}

function findBestMatch(
  extractedName: string,
  itemNames: string[],
  paperBillNames: Record<string, string> = {}
): { matchedName: string | null; confidence: "high" | "medium" | "low" } {
  if (!extractedName || itemNames.length === 0) return { matchedName: null, confidence: "low" };

  const normExtracted = normalizeText(extractedName);
  let bestName: string | null = null;
  let bestScore = 0;

  for (const masterName of itemNames) {
    const normMaster = normalizeText(masterName);
    const paperName = paperBillNames[masterName];
    const normPaper = paperName ? normalizeText(paperName) : null;

    if (normPaper) {
      if (normExtracted === normPaper) return { matchedName: masterName, confidence: "high" };
      if (normPaper.includes(normExtracted) || normExtracted.includes(normPaper)) return { matchedName: masterName, confidence: "high" };
      if (isAbbreviationMatch(normExtracted, normPaper)) {
        const score = 0.92;
        if (score > bestScore) { bestScore = score; bestName = masterName; }
      }
    }

    if (normExtracted === normMaster) return { matchedName: masterName, confidence: "high" };

    if (normMaster.includes(normExtracted) || normExtracted.includes(normMaster)) {
      const score = 0.9;
      if (score > bestScore) { bestScore = score; bestName = masterName; }
      continue;
    }

    if (isAbbreviationMatch(normExtracted, normMaster)) {
      const score = 0.8;
      if (score > bestScore) { bestScore = score; bestName = masterName; }
      continue;
    }

    const maxLen = Math.max(normExtracted.length, normMaster.length);
    if (maxLen > 0) {
      const dist = levenshtein(normExtracted, normMaster);
      const similarity = 1 - dist / maxLen;
      if (similarity > bestScore) { bestScore = similarity; bestName = masterName; }
    }

    if (normPaper) {
      const maxLen2 = Math.max(normExtracted.length, normPaper.length);
      if (maxLen2 > 0) {
        const dist2 = levenshtein(normExtracted, normPaper);
        const sim2 = 1 - dist2 / maxLen2;
        if (sim2 > bestScore) { bestScore = sim2; bestName = masterName; }
      }
    }
  }

  if (bestScore >= 0.75) return { matchedName: bestName, confidence: "high" };
  if (bestScore >= 0.5) return { matchedName: bestName, confidence: "medium" };
  if (bestScore >= 0.3) return { matchedName: bestName, confidence: "low" };
  return { matchedName: null, confidence: "low" };
}

// Build dynamic prompt based on column mapping config
function buildExtractionPrompt(
  itemNamesStr: string,
  columnMapping?: {
    totalColumns?: number;
    itemNameColumn?: number;
    quantityColumn?: number;
    quantityType?: string;
    rateColumn?: number | null;
    amountColumn?: number;
    hasRate?: boolean;
    hasAmount?: boolean;
  }
): string {
  if (columnMapping && columnMapping.totalColumns) {
    const cols = columnMapping.totalColumns;
    const parts: string[] = [];
    parts.push(`This paper bill has ${cols} columns.`);
    parts.push(`Column ${columnMapping.itemNameColumn} = Item Name`);
    parts.push(`Column ${columnMapping.quantityColumn} = Quantity (${columnMapping.quantityType || 'primary'})`);
    if (columnMapping.hasRate && columnMapping.rateColumn) {
      parts.push(`Column ${columnMapping.rateColumn} = Rate/Price per unit`);
    }
    if (columnMapping.hasAmount) {
      parts.push(`Column ${columnMapping.amountColumn} = Amount/Total`);
    }

    const extractFields: string[] = ["extractedName (from Item Name column)"];
    extractFields.push("quantity (from Quantity column)");
    if (columnMapping.hasRate && columnMapping.rateColumn) extractFields.push("rate (from Rate column)");
    if (columnMapping.hasAmount) extractFields.push("amount (from Amount column)");

    return `You are an OCR bill reader. The paper bill has a specific column layout:
${parts.join("\n")}

Extract each row from the bill image according to this column mapping.

IMPORTANT:
- Item names on paper may be abbreviated - extract EXACTLY as written.
- For quantities with fractions like ½, ¼ etc, convert to decimal.
- Return ONLY valid JSON array, no other text.
${itemNamesStr}

Return JSON array format:
[
  {
    "extractedName": "name exactly as written on paper",
    "quantity": number${columnMapping.hasRate && columnMapping.rateColumn ? ',\n    "rate": number' : ''}${columnMapping.hasAmount ? ',\n    "amount": number' : ''}
  }
]

If you cannot read the image or no items found, return an empty array [].`;
  }

  // Default prompt (no column mapping)
  return `You are an OCR bill reader. Extract ONLY these 3 columns from each row in this bill/invoice image:
1. Item Name (as written on the paper, exactly as it appears including abbreviations)
2. Quantity (numeric, the quantity/count column - NOT rate. Handle fractions like ½, ¼, ¾, ⅓)  
3. Amount/Total (numeric, the total amount for that row - NOT rate per unit)

IMPORTANT: 
- Extract quantity and amount columns only. Do NOT extract rate/price per unit.
- Each row in the bill represents one item.
- Item names on paper may be abbreviated or partially written - extract EXACTLY as written.
- For quantities with fractions like ½, ¼ etc, convert to decimal (0.5, 0.25 etc).
- Return ONLY valid JSON array, no other text.
${itemNamesStr}

Return JSON array format:
[
  {
    "extractedName": "name exactly as written on paper",
    "quantity": number,
    "amount": number
  }
]

If you cannot read the image or no items found, return an empty array [].`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageBase64, itemNames, paperBillNames, columnMapping } = await req.json();

    if (!imageBase64) {
      throw new Error("No image provided");
    }

    const itemNamesStr = itemNames && itemNames.length > 0
      ? `\n\nHere is the item master list for reference:\n${itemNames.join("\n")}`
      : "";

    const prompt = buildExtractionPrompt(itemNamesStr, columnMapping);

    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:")
                    ? imageBase64
                    : `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`AI Gateway error [${response.status}]: ${errBody}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "[]";

    let rawItems = [];
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      rawItems = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      rawItems = [];
    }

    const masterNames = itemNames || [];
    const paperNames = paperBillNames || {};
    const hasRate = columnMapping?.hasRate && columnMapping?.rateColumn;
    const hasAmount = columnMapping?.hasAmount !== false;

    const items = rawItems.map((raw: any) => {
      const quantity = parseFractionalQuantity(raw.quantity);
      const rate = hasRate ? (typeof raw.rate === "number" ? raw.rate : parseFloat(raw.rate) || 0) : 0;
      let amount = hasAmount ? (typeof raw.amount === "number" ? raw.amount : parseFloat(raw.amount) || 0) : 0;
      
      // If we have rate but no amount, calculate it
      if (hasRate && !hasAmount && rate > 0 && quantity > 0) {
        amount = quantity * rate;
      }
      // If we have both rate and amount, use amount as-is
      // If we have neither, amount stays 0

      const match = findBestMatch(raw.extractedName || "", masterNames, paperNames);

      return {
        extractedName: raw.extractedName || "",
        matchedName: match.matchedName,
        quantity,
        rate,
        amount,
        confidence: match.confidence,
      };
    });

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error extracting bill items:", error);
    return new Response(JSON.stringify({ error: "Failed to process image. Please try again.", items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
