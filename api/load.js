export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.body;
  if (!date) return res.status(400).json({ error: '날짜가 없어요' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { property: '날짜', date: { equals: date } },
        sorts: [{ property: '시작 시간', direction: 'ascending' }]
      })
    });
    const data = await r.json();
    const CAT_MAP = {
      '🎯 집중업무':'집중업무','📚 학습':'학습','🍽️ 식사':'식사',
      '🏃 운동':'운동','💤 휴식':'휴식','🚿 루틴':'루틴',
      '🚗 이동':'이동','💬 소통':'소통','⚡ 기타':'기타'
    };
    const result = { plan: [], actual: [] };
    for (const page of data.results) {
      const p = page.properties;
      const type     = p['유형']?.select?.name === '계획' ? 'plan' : 'actual';
      const titleRaw = p['제목']?.title?.[0]?.text?.content || '';
      const title    = titleRaw.replace(/^\[\d{4}-\d{2}-\d{2}\] /, '');
      const start    = p['시작 시간']?.rich_text?.[0]?.text?.content || '';
      const end      = p['종료 시간']?.rich_text?.[0]?.text?.content || '';
      const catRaw   = p['카테고리']?.select?.name || '';
      const cat      = CAT_MAP[catRaw] || '기타';
      const memo     = p['메모']?.rich_text?.[0]?.text?.content || '';
      if (title && start && end) result[type].push({ title, start, end, cat, memo });
    }
    res.status(200).json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
