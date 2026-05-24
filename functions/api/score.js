/**
 * Bouncy Hop 🎮 — 在线排行榜 API
 * 
 * Cloudflare Pages Functions
 * 
 * GET  /api/score         → 获取前 20 名全服排行榜
 * POST /api/score         → 提交分数
 *   body: { name, score, playerId }
 *   - playerId: 匿名设备 ID，用于区分用户、防刷榜（每人只保留最高分）
 */

const LEADERBOARD_KEY = 'leaderboard_v3';
const MAX_ENTRIES = 20;

/**
 * GET /api/score - 返回全服排行榜
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
 * 每人(playerId)只保留最高分，相同 playerId 时自动覆盖
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
    const playerId = (body.playerId || '').trim();

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
    if (!playerId) {
      return new Response(JSON.stringify({ success: false, error: '缺少设备标识' }), {
        status: 400,
        headers,
      });
    }

    // 读取当前排行榜
    let leaderboard = (await kv.get(LEADERBOARD_KEY, 'json')) || [];

    // 检查该 playerId 是否已有记录
    const existingIndex = leaderboard.findIndex((e) => e.playerId === playerId);

    if (existingIndex >= 0) {
      // 已有记录：如果新分数更高则更新
      const existing = leaderboard[existingIndex];
      if (score > existing.score) {
        existing.score = score;
        existing.name = name;           // 更新到最新昵称
        existing.date = new Date().toISOString().slice(0, 10);
      } else {
        // 新分数更低，不更新排行榜，只返回当前排名
        leaderboard.sort((a, b) => b.score - a.score);
        const rank = leaderboard.findIndex((e) => e.playerId === playerId) + 1;
        return new Response(
          JSON.stringify({
            success: true,
            rank,
            total: leaderboard.length,
            personalBest: existing.score,
            message: `未超过个人最高分 (${existing.score})，未更新排行榜`,
          }),
          { headers }
        );
      }
    } else {
      // 新玩家，添加记录
      leaderboard.push({
        name,
        score,
        playerId,
        date: new Date().toISOString().slice(0, 10),
      });
    }

    // 按分数降序排列，取前 MAX_ENTRIES 名
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, MAX_ENTRIES);

    // 写入 KV
    await kv.put(LEADERBOARD_KEY, JSON.stringify(leaderboard));

    // 计算当前玩家排名
    const rank = leaderboard.findIndex((e) => e.playerId === playerId) + 1;

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
