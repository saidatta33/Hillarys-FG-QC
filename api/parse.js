export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pdfBase64, prompt } = req.body;

    const defaultPrompt = `Extract ALL product line items from this Insyte job sheet PDF.
Return ONLY a valid JSON array. No markdown, no backticks, no explanation.
Each object: {"lineNo":number,"location":"room name","type":"Curtain or Blind","section":"Curtain/Roman Blind/Roller Shades/Day & Night Shades/Wood Blinds","fabricCode":"full product code","fabric":"name only no codes","width":"mm","drop":"mm","mountType":"In or Out","mountDetail":"Ceiling Mount or Wall Mount","trackType":"I Track or Sleek M Track or Rod or none","trackVendor":"vendor or none","lining":"Yes or No","liningType":"Dimout or Blackout or Regular or none","liningFabric":"lining name or none","headingType":"heading style","panels":"number","stack":"stack direction","controlSystem":"Manual or Motorised","installSurface":"Normal or Granite etc","fabricVendor":"vendor name"}
Rules:
- type = Curtain for Curtain section, Blind for everything else
- fabric field: name only, no codes, no W:3000 suffix, no Translucent/Blackout/Dimout prefix
- fabricCode: the full product code e.g. MPTS012090169
- Include every single row from every table`;

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
            { type: 'text', text: prompt || defaultPrompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API Error' });
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

    return res.status(200).json({ items: parsed });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
