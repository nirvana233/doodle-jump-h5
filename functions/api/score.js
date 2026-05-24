/**
 * Bouncy Hop 🎮 — 在线排行榜 API
 * 
 * Cloudflare Pages Functions
 * 
 * GET  /api/score         → 获取前 20 名排行榜
 * POST /api/score         → 提交分数
 *   body: { name, score }
 */

const LEADERBOARD_KEY = 'leaderboard_v2';
const MAX_ENTRIES = 20;

/**
 * GET /api/score - 返回排行榜
 */
export async function onRequestGet(context) {
  const kv = context.env.LEADERBOARD_KV;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await kv.get(LEADERBOARD_KEY, 'json');
    return new Response(JSON.stringify({ success: true, scores: data || [] }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers,
    });
  }
}

/**
 * POST /api/score - 提交分数
 */
export async function onRequestPost(context) {
  const kv = context.env.LEADERBOARD_KV;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // 解析请求体
    let body;
    const contentType = context.request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      body = await context.request.json();
    } else {
      const formData = await context.request.formData();
      body = Object.fromEntries(formData);
    }

    // 校验参数
    const name = (body.name || '').trim().slice(0, 12);
    const score = parseInt(body.score) || 0;

    if (!name) {
      return new Response(JSON.stringify({ success: false, error: '请输入昵称' }), {
        status: 400,
        headers,
      });
    }
    if (score <= 0) {
      return new Response(JSON.stringify({ success: false, error: '分数无效' }), {
        status: 400,
        headers,
      });
    }

    // 读取当前排行榜
    let leaderboard = (await kv.get(LEADERBOARD_KEY, 'json')) || [];

    // 添加新记录
    leaderboard.push({
      name,
      score,
      date: new Date().toISOString().slice(0, 10),
    });

    // 按分数降序排列，取前 MAX_ENTRIES 名
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, MAX_ENTRIES);

    // 写入 KV
    await kv.put(LEADERBOARD_KEY, JSON.stringify(leaderboard));

    // 计算排名
    const rank = leaderboard.findIndex((e) => e.name === name && e.score === score) + 1;

    return new Response(
      JSON.stringify({ success: true, rank, total: leaderboard.length }),
      { headers }
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers,
    });
  }
}
