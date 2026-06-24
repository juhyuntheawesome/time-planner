export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_ID = process.env.NOTION_DB_ID;
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const NOTION_COLOR_MAP = {
    default: { bg: '#f3f4f6', text: '#374151' },
    gray:    { bg: '#f3f4f6', text: '#374151' },
    brown:   { bg: '#fef3c7', text: '#78350f' },
    orange:  { bg: '#ffedd5', text: '#7c2d12' },
    yellow:  { bg: '#fef9c3', text: '#713f12' },
    green:   { bg: '#dcfce7', text: '#14532d' },
    blue:    { bg: '#dbeafe', text: '#1e3a5f' },
    purple:  { bg: '#ede9fe', text: '#3b0764' },
    pink:    { bg: '#fce7f3', text: '#831843' },
    red:     { bg: '#fef2f2', text: '#991b1b' },
  };
  const COLOR_NAMES = ['gray','brown','orange','yellow','green','blue','purple','pink','red'];

  // GET: 카테고리 목록 불러오기
  if (req.method === 'GET') {
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
      const data = await r.json();
      const options = data.properties?.['카테고리']?.select?.options || [];
      const cats = options.map(opt => {
        const colorKey = opt.color || 'default';
        const color = NOTION_COLOR_MAP[colorKey] || NOTION_COLOR_MAP.default;
        const match = opt.name.match(/^(\p{Emoji}+)\s*(.+)$/u);
        const emoji = match ? match[1] : '⭐';
        const name  = match ? match[2].trim() : opt.name;
        return { name, emoji, bg: color.bg, text: color.text, notionColor: colorKey, notionName: opt.name };
      });
      res.status(200).json({ cats });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // POST: 카테고리 추가
  if (req.method === 'POST') {
    const { name, emoji, colorIndex } = req.body;
    if (!name) return res.status(400).json({ error: '이름이 없어요' });
    const notionColor = COLOR_NAMES[colorIndex % COLOR_NAMES.length] || 'gray';
    const notionName = `${emoji || '⭐'} ${name}`;
    try {
      // 기존 옵션 조회
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
      const data = await r.json();
      const existing = data.properties?.['카테고리']?.select?.options || [];
      if (existing.find(o => o.name === notionName)) {
        return res.status(400).json({ error: '이미 있는 카테고리예요' });
      }
      // 새 옵션 추가
      const newOptions = [...existing.map(o => ({ name: o.name, color: o.color })), { name: notionName, color: notionColor }];
      await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties: { '카테고리': { select: { options: newOptions } } } })
      });
      const color = NOTION_COLOR_MAP[notionColor] || NOTION_COLOR_MAP.default;
      res.status(200).json({ cat: { name, emoji, bg: color.bg, text: color.text, notionColor, notionName } });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // DELETE: 카테고리 삭제
  if (req.method === 'DELETE') {
    const { notionName } = req.body;
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
      const data = await r.json();
      const existing = data.properties?.['카테고리']?.select?.options || [];
      const newOptions = existing.filter(o => o.name !== notionName).map(o => ({ name: o.name, color: o.color }));
      await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties: { '카테고리': { select: { options: newOptions } } } })
      });
      res.status(200).json({ ok: true });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
