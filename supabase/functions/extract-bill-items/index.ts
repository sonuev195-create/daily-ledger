import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageBase64, itemNames } = await req.json();

    if (!imageBase64) {
      throw new Error("No image provided");
    }

    // Build the prompt with item master names for matching
    const itemNamesStr = itemNames && itemNames.length > 0
      ? `\n\nHere is the item master list. Match extracted item names to the CLOSEST item from this list (items on paper may be abbreviated or partially written):\n${itemNames.join("\n")}`
      : "";

    const prompt = `You are an OCR bill reader. Extract ONLY these 3 columns from each row in this bill/invoice image:
1. Item Name (as written on the paper)
2. Quantity (numeric, the quantity/count column - NOT rate)  
3. Amount/Total (numeric, the total amount for that row - NOT rate per unit)

IMPORTANT: 
- Extract quantity and amount columns only. Do NOT extract rate/price per unit.
- Each row in the bill represents one item.
- Item names on paper may be abbreviated or partially written.
- Return ONLY valid JSON array, no other text.
${itemNamesStr}

Return JSON array format:
[
  {
    "extractedName": "name as written on paper",
    "matchedName": "best matching name from item master or null if no master list",
    "quantity": number,
    "amount": number,
    "confidence": "high" | "medium" | "low"
  }
]

If you cannot read the image or no items found, return an empty array [].`;

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

    // Parse JSON from response (handle markdown code blocks)
    let items = [];
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      items = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      items = [];
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error extracting bill items:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage, items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
