export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    if (!body || !body.pdfBase64) {
      return res.status(400).json({ error: 'No PDF data received' });
    }

    const { pdfBase64, prompt } = body;

    const defaultPrompt = `Extract ALL product line items from this Insyte job sheet PDF.
Return ONLY a valid JSON array. No markdown, no backticks, no explanation.
Each object must have ALL these fields:
{
  "lineNo": number,
  "location": "exact room name e.g. Living w1",
  "type": "Curtain or Blind",
  "section": "Curtain or Roman Blind or Roller Shades or Day & Night Shades or Wood Blinds",
  "fabricCode": "full product code e.g. MPTS012090169",
  "fabric": "fabric name only - no codes, no W:3000, no Translucent/Blackout prefix",
  "fabricVendor": "fabric vendor name",
  "width": "width in mm as number string",
  "drop": "drop in mm as number string",
  "mountType": "In or Out",
  "mountDetail": "Ceiling Mount or Wall Mount or Single Wall Mount",
  "trackType": "I Track or Sleek M Track or Rod or none",
  "trackVendor": "track vendor or none",
  "controlSystem": "Manual or Motorised",
  "lining": "Yes or No",
  "liningType": "Dimout or Blackout or Regular or none",
  "liningFabric": "lining fabric name or none",
  "headingType": "Triple Pinch Pleat or Ripplefold etc or none",
  "panels": "number of panels as string",
  "stack": "Free or Centre Open or Left or Right or none",
  "installSurface": "Normal or Granite or other surface"
}
Rules:
- type = "Curtain" for Curtain section rows, "Blind" for all other sections
- fabric: name only, strip codes like MPTS012090169, strip W: 3000, strip Translucent/Room Darkening/Blackout/Light Filtering prefix
- fabricCode: the raw product code only e.g. MPTS012090169
- Include EVERY single row from EVERY table in the document`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            {
              type: 'text',
              text: prompt || defaultPrompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || `API Error ${response.status}` });
    }

    const data = await response.json();
    const raw = data.content?.find(c => c.type === 'text')?.text || '';

    let parsed;
    try {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const m = raw.match(/\[[\s\S]+\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(200).json({ error: 'No items found in PDF. Make sure this is an Insyte job sheet.', items: [] });
    }

    return res.status(200).json({ items: parsed });

  } catch (err) {
    console.error('Parse error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
