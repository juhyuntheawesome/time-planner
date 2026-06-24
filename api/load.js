export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.body;
  if (!date) return res.status(400).json({ error: '날짜가 없어요' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_ID = process.env.NOTION_DB_ID;
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // 카테고리 옵션 동적으로 가져오기
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
    const dbData = await dbRes.json();
    const catOptions = dbData.properties?.['카테고리']?.select?.options || [];

    // notionName(이모지+이름) → name(이름만) 매핑
    const CAT_FROM = {};
    catOptions.forEach(opt => {
      const match = opt.name.match(/^(\p{Emoji}+)\s*(.+)$/u);
      const name = match ? match[2].trim() : opt.name;
      CAT_FROM[opt.name] = name; // 예: '📚 학습' → '학습'
    });

    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        filter: { property: '날짜', date: { equals: date } },
        sorts: [{ property: '시작 시간', direction: 'ascending' }]
      })
    });
    const data = await r.json();
    const result = { plan: [], actual: [] };

    for (const page of data.results) {
      const p = page.properties;
      const type     = p['유형']?.select?.name === '계획' ? 'plan' : 'actual';
      const titleRaw = p['제목']?.title?.[0]?.text?.content || '';
      const title    = titleRaw.replace(/^\[\d{4}-\d{2}-\d{2}\] /, '');
      const start    = p['시작 시간']?.rich_text?.[0]?.text?.content || '';
      const end      = p['종료 시간']?.rich_text?.[0]?.text?.content || '';
      const catRaw   = p['카테고리']?.select?.name || '';
      const cat      = CAT_FROM[catRaw] || catRaw || '기타';
      const memo     = p['메모']?.rich_text?.[0]?.text?.content || '';
      if (title && start && end) result[type].push({ title, start, end, cat, memo });
    }

    res.status(200).json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
