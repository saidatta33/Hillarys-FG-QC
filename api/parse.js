export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF data received' });

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
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: 'Extract ALL product line items from this Insyte job sheet PDF.\nReturn ONLY a valid JSON array. No markdown, no backticks, no explanation.\nEach object must have: {"lineNo":number,"location":"exact room name","type":"Curtain or Blind","section":"Curtain or Roman Blind or Roller Shades or Day & Night Shades or Wood Blinds","fabricCode":"product code only e.g. MPTS012090169","fabric":"fabric name only - no codes, no W:3000 suffix, no Translucent/Blackout/Dimout/Room Darkening prefix","fabricVendor":"vendor name or none","width":"mm as number string","drop":"mm as number string","mountType":"In or Out","mountDetail":"Ceiling Mount or Wall Mount or none","trackType":"I Track or Sleek M Track or Rod or none","controlSystem":"Manual or Motorised","lining":"Yes or No","liningType":"Dimout or Blackout or Regular or none","liningFabric":"lining fabric name or none","headingType":"Triple Pinch Pleat or Ripplefold or none","panels":"number or none","stack":"Free or Centre Open or Left or Right or none","installSurface":"Normal or Granite or other"}\nInclude every single row from every table.' }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API Error ' + response.status });
    }

    const data = await response.json();
    const raw = data.content?.find(c => c.type === 'text')?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch {
      const m = raw.match(/\[[\s\S]+\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      return res.status(200).json({ error: 'No items found. Is this an Insyte job sheet?', items: [] });
    }

    return res.status(200).json({ items: parsed });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
