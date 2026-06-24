export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date, blocks } = req.body;
  if (!date) return res.status(400).json({ error: '날짜가 없어요' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_ID = process.env.NOTION_DB_ID;
  const DAILY_LOG_DB_ID = process.env.DAILY_LOG_DB_ID;

  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // 노션에서 카테고리 옵션 동적으로 가져오기
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
    const dbData = await dbRes.json();
    const catOptions = dbData.properties?.['카테고리']?.select?.options || [];

    // name(이름만) → notionName(이모지+이름) 매핑
    const CAT_MAP = {};
    catOptions.forEach(opt => {
      const match = opt.name.match(/^(\p{Emoji}+)\s*(.+)$/u);
      const name = match ? match[2].trim() : opt.name;
      CAT_MAP[name] = opt.name; // 예: '학습' → '📚 학습'
    });

    // 기존 블록 삭제
    const existing = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({ filter: { property: '날짜', date: { equals: date } } })
    });
    const existingData = await existing.json();
    await Promise.all(existingData.results.map(page =>
      fetch(`https://api.notion.com/v1/pages/${page.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ archived: true })
      })
    ));

    // 새 블록 저장
    const newPages = await Promise.all(blocks.map(b =>
      fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({
          parent: { database_id: DB_ID },
          properties: {
            '제목':    { title: [{ text: { content: `[${date}] ${b.title}` } }] },
            '날짜':    { date: { start: date } },
            '시작 시간': { rich_text: [{ text: { content: b.start } }] },
            '종료 시간': { rich_text: [{ text: { content: b.end } }] },
            '카테고리': { select: { name: CAT_MAP[b.cat] || b.cat } },
            '유형':    { select: { name: b.type === 'plan' ? '계획' : '실제' } },
            '완료':    { checkbox: false },
            ...(b.memo ? { '메모': { rich_text: [{ text: { content: b.memo } }] } } : {})
          }
        })
      }).then(r => r.json())
    ));

    // Daily Log 연결
    if (DAILY_LOG_DB_ID) {
      const logRes = await fetch(`https://api.notion.com/v1/databases/${DAILY_LOG_DB_ID}/query`, {
        method: 'POST', headers,
        body: JSON.stringify({
          filter: { property: '날짜 (Date)', date: { equals: date } }
        })
      });
      const logData = await logRes.json();
      const newPageIds = newPages.map(p => ({ id: p.id }));

      if (logData.results.length > 0) {
        await fetch(`https://api.notion.com/v1/pages/${logData.results[0].id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ properties: { '시간 계획': { relation: newPageIds } } })
        });
      } else {
        await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers,
          body: JSON.stringify({
            parent: { database_id: DAILY_LOG_DB_ID },
            properties: {
              '한줄요약': { title: [{ text: { content: date } }] },
              'date:날짜 (Date):start': date,
              'date:날짜 (Date):is_datetime': 0,
              '시간 계획': { relation: newPageIds }
            }
          })
        });
      }
    }

    res.status(200).json({ saved: blocks.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
