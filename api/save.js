export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date, blocks } = req.body;
  if (!date) return res.status(400).json({ error: '날짜가 없어요' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_ID = process.env.NOTION_DB_ID;
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  const CAT_MAP = {
    '집중업무':'🎯 집중업무','학습':'📚 학습','식사':'🍽️ 식사',
    '운동':'🏃 운동','휴식':'💤 휴식','루틴':'🚿 루틴',
    '이동':'🚗 이동','소통':'💬 소통','기타':'⚡ 기타'
  };

  try {
    // 1. 해당 날짜 기존 항목 조회
    const existing = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({ filter: { property: '날짜', date: { equals: date } } })
    });
    const existingData = await existing.json();

    // 2. 기존 항목 전부 삭제(archive)
    await Promise.all(existingData.results.map(page =>
      fetch(`https://api.notion.com/v1/pages/${page.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ archived: true })
      })
    ));

    // 3. 새 블록 저장
    await Promise.all(blocks.map(b =>
      fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({
          parent: { database_id: DB_ID },
          properties: {
            '제목':    { title: [{ text: { content: `[${date}] ${b.title}` } }] },
            '날짜':    { date: { start: date } },
            '시작 시간': { select: { name: b.start } },
            '종료 시간': { select: { name: b.end } },
            '카테고리': { select: { name: CAT_MAP[b.cat] || b.cat } },
            '유형':    { select: { name: b.type === 'plan' ? '계획' : '실제' } },
            '완료':    { checkbox: false },
            ...(b.memo ? { '메모': { rich_text: [{ text: { content: b.memo } }] } } : {})
          }
        })
      })
    ));

    res.status(200).json({ saved: blocks.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
