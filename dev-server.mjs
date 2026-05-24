/**
 * Bouncy Hop 🎮 — 本地开发服务器
 * 静态文件服务 + API mock（模拟 Cloudflare Pages Functions）
 * 
 * 用法: node dev-server.mjs
 * 然后访问 http://localhost:5173
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5173;

// 本地 KV 模拟（存在内存里）
const localKV = new Map();

// MIME 类型
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ========== API: 排行榜 ==========
  if (pathname === '/api/score') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const data = localKV.get('leaderboard_v3') || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, scores: data }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { name, score, playerId } = JSON.parse(body);
          if (!name || !score || !playerId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: '参数不完整' }));
            return;
          }

          let leaderboard = localKV.get('leaderboard_v3') || [];
          const idx = leaderboard.findIndex(e => e.playerId === playerId);

          if (idx >= 0) {
            if (score > leaderboard[idx].score) {
              leaderboard[idx].score = score;
              leaderboard[idx].name = name;
              leaderboard[idx].date = new Date().toISOString().slice(0, 10);
            }
          } else {
            leaderboard.push({ name, score, playerId, date: new Date().toISOString().slice(0, 10) });
          }

          leaderboard.sort((a, b) => b.score - a.score);
          leaderboard = leaderboard.slice(0, 20);
          localKV.set('leaderboard_v3', leaderboard);

          const rank = leaderboard.findIndex(e => e.playerId === playerId) + 1;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, rank, total: leaderboard.length }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '请求格式错误' }));
        }
      });
      return;
    }
  }

  // ========== 静态文件服务 ==========
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 如果 index.html 内有子路径，回退到 index.html（SPA 兼容）
      if (!pathname.startsWith('/src/') && !pathname.startsWith('/assets/') && !pathname.startsWith('/functions/')) {
        fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🎮 Bouncy Hop 本地开发服务器\n  → http://localhost:${PORT}\n`);
});
