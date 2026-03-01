#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classifyWaiting(description) {
  const text = String(description || "");

  if (/(煮込|蒸らし|放置|休ませ|寝かせ|冷ま|浸し|つけ置き)/.test(text)) {
    return true;
  }

  if (/(\d+|\d+〜\d+|約\d+)分.*煮/.test(text) && !/卵/.test(text)) {
    return true;
  }

  if (/中火で.*分.*煮る/.test(text) && !/卵/.test(text)) {
    return true;
  }

  if (/火を.*落として/.test(text)) {
    return true;
  }

  return false;
}

function parseSection(sectionHtml) {
  const title = (sectionHtml.match(/<h2>(.*?)<\/h2>/) || [null, "unknown"])[1];
  const totalTime = Number(
    (sectionHtml.match(/total:\s*(\d+)\s*min/) || [null, "0"])[1],
  );
  const taskCount = Number(
    (sectionHtml.match(/tasks:\s*(\d+)/) || [null, "0"])[1],
  );
  const algorithmUsed = (sectionHtml.match(/algo:\s*([^<]+)/) || [null, "unknown"])[1].trim();

  const rows = [...sectionHtml.matchAll(/<div class="row"><div class="label">([\s\S]*?)<\/div><div class="lane">([\s\S]*?)<\/div><\/div>/g)];

  const recipeRows = [];
  const allTasks = [];

  for (const row of rows) {
    const recipeName = row[1].trim();
    const laneHtml = row[2];
    const bars = [...laneHtml.matchAll(/<div class="bar"[^>]*title="(\d+)-(\d+)\s([^\"]+)"[^>]*><\/div>/g)];

    const tasks = bars.map((b) => {
      const start = Number(b[1]);
      const end = Number(b[2]);
      const description = b[3].trim();
      const waiting = classifyWaiting(description);
      return {
        recipe_name: recipeName,
        start,
        end,
        duration: end - start,
        description,
        waiting,
      };
    });

    tasks.sort((a, b) => a.start - b.start || a.end - b.end);
    recipeRows.push({ recipe_name: recipeName, tasks });
    allTasks.push(...tasks);
  }

  allTasks.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    title,
    totalTime,
    taskCount,
    algorithmUsed,
    recipeRows,
    tasks: allTasks,
  };
}

function buildTimeState(section) {
  const total = section.totalTime;
  const states = [];

  for (let minute = 0; minute < total; minute++) {
    let hasWork = false;
    let hasWaiting = false;
    for (const t of section.tasks) {
      if (t.start < minute + 1 && t.end > minute) {
        if (t.waiting) hasWaiting = true;
        else hasWork = true;
      }
    }

    if (hasWork) states.push("work");
    else if (hasWaiting) states.push("waiting_only");
    else states.push("idle");
  }

  const segments = [];
  if (states.length > 0) {
    let current = states[0];
    let start = 0;
    for (let i = 1; i <= states.length; i++) {
      if (i === states.length || states[i] !== current) {
        segments.push({ state: current, start, end: i });
        current = states[i];
        start = i;
      }
    }
  }

  const workOnlyMin = states.filter((s) => s === "work").length;
  const waitingOnlyMin = states.filter((s) => s === "waiting_only").length;
  const idleMin = states.filter((s) => s === "idle").length;

  const taskWaitMin = section.tasks
    .filter((t) => t.waiting)
    .reduce((acc, t) => acc + t.duration, 0);
  const taskWorkMin = section.tasks
    .filter((t) => !t.waiting)
    .reduce((acc, t) => acc + t.duration, 0);

  return {
    workOnlyMin,
    waitingOnlyMin,
    idleMin,
    taskWaitMin,
    taskWorkMin,
    segments,
  };
}

function renderSection(section) {
  const state = buildTimeState(section);
  const total = Math.max(1, section.totalTime);

  const segmentHtml = state.segments
    .map((seg) => {
      const width = ((seg.end - seg.start) / total) * 100;
      const left = (seg.start / total) * 100;
      const cls = seg.state === "work" ? "work" : seg.state === "waiting_only" ? "wait" : "idle";
      return `<div class="seg ${cls}" style="left:${left}%;width:${width}%" title="${seg.start}-${seg.end} min"></div>`;
    })
    .join("");

  const rowsHtml = section.recipeRows
    .map((row) => {
      const bars = row.tasks
        .map((t) => {
          const left = (t.start / total) * 100;
          const width = ((t.end - t.start) / total) * 100;
          const cls = t.waiting ? "wait" : "work";
          const tip = `${t.start}-${t.end} ${t.waiting ? "待ち" : "作業"} ${t.description}`;
          return `<div class="task ${cls}" style="left:${left}%;width:${width}%" title="${escapeHtml(tip)}"></div>`;
        })
        .join("");

      return `<div class="recipe-row"><div class="recipe-name">${escapeHtml(row.recipe_name)}</div><div class="lane">${bars}</div></div>`;
    })
    .join("");

  const tableRows = section.tasks
    .map((t) => {
      const label = t.waiting ? "待ち" : "作業";
      return `<tr><td>${t.start}-${t.end}</td><td>${escapeHtml(t.recipe_name)}</td><td>${label}</td><td>${escapeHtml(t.description)}</td></tr>`;
    })
    .join("");

  return `
  <section class="card">
    <h2>${escapeHtml(section.title)}</h2>
    <div class="meta">
      <span class="pill">total ${section.totalTime} min</span>
      <span class="pill">tasks ${section.taskCount}</span>
      <span class="pill">algo ${escapeHtml(section.algorithmUsed)}</span>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">作業タスク合計</div><div class="v">${state.taskWorkMin} 分</div></div>
      <div class="stat"><div class="k">待ちタスク合計</div><div class="v">${state.taskWaitMin} 分</div></div>
      <div class="stat"><div class="k">時系列: 作業中</div><div class="v">${state.workOnlyMin} 分</div></div>
      <div class="stat"><div class="k">時系列: 待ちのみ</div><div class="v">${state.waitingOnlyMin} 分</div></div>
      <div class="stat"><div class="k">時系列: 空き</div><div class="v">${state.idleMin} 分</div></div>
    </div>

    <div class="timeline">${segmentHtml}</div>
    <div class="tick">0 ... ${section.totalTime} min</div>

    <div class="recipes">${rowsHtml}</div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>time</th><th>recipe</th><th>区分</th><th>task</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </section>`;
}

async function main() {
  const inDirArg = process.argv[2] || "test-results/compare-spliton-greedy-vs-agent-2026-03-01T04-24-20-810Z";
  const inDir = path.resolve(inDirArg);
  const inHtml = path.join(inDir, "compare.html");

  if (!fs.existsSync(inHtml)) {
    throw new Error(`compare.html not found: ${inHtml}`);
  }

  const raw = fs.readFileSync(inHtml, "utf8");
  const topInfo = (raw.match(/<div class="top">([\s\S]*?)<\/div>/) || [null, ""])[1];
  const subtitle = (raw.match(/<div class="sub">([\s\S]*?)<\/div>/) || [null, ""])[1];
  const sections = [...raw.matchAll(/<section class="card">([\s\S]*?)<\/section>/g)].map((m) => parseSection(m[1]));

  if (sections.length !== 2) {
    throw new Error(`expected 2 cards, got ${sections.length}`);
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve("test-results", `wait-vs-work-compare-${now}`);
  fs.mkdirSync(outDir, { recursive: true });

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>待ち時間 vs 作業時間 比較</title>
<style>
:root {
  --bg: #f7f7f2;
  --ink: #102a43;
  --card: #ffffff;
  --muted: #486581;
  --line: #d9e2ec;
  --work: #0f766e;
  --wait: #f59e0b;
  --idle: #cbd5e1;
}
* { box-sizing: border-box; }
body { margin: 16px; color: var(--ink); background: radial-gradient(circle at 10% -10%, #e8f7f3 0%, #f7f7f2 55%); font-family: "Noto Sans JP", "Hiragino Sans", sans-serif; }
h1 { margin: 0 0 6px; font-size: 26px; }
.sub { color: var(--muted); margin-bottom: 8px; }
.top { background: #ecfeff; border: 1px solid #99f6e4; padding: 8px 10px; border-radius: 8px; margin-bottom: 10px; font-size: 13px; }
.legend { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; font-size: 12px; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.work { background: var(--work); }
.dot.wait { background: var(--wait); }
.dot.idle { background: var(--idle); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; box-shadow: 0 8px 22px rgba(16,42,67,0.08); }
.card h2 { margin: 0 0 8px; font-size: 20px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.pill { font-size: 12px; background: #f0f4f8; border: 1px solid #d9e2ec; border-radius: 999px; padding: 4px 8px; }
.stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.stat { border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; background: #fcfdff; }
.k { font-size: 11px; color: var(--muted); }
.v { font-size: 16px; font-weight: 700; }
.timeline { position: relative; height: 24px; background: #eef2f7; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
.seg { position: absolute; top: 0; height: 100%; }
.seg.work { background: var(--work); }
.seg.wait { background: repeating-linear-gradient(135deg, #f59e0b, #f59e0b 6px, #fbbf24 6px, #fbbf24 12px); }
.seg.idle { background: var(--idle); }
.tick { font-size: 11px; color: var(--muted); margin: 4px 0 8px; }
.recipe-row { display: grid; grid-template-columns: 190px 1fr; gap: 8px; align-items: center; margin: 6px 0; }
.recipe-name { font-size: 12px; color: var(--muted); }
.lane { position: relative; height: 24px; background: #eef2f7; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.task { position: absolute; top: 3px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2); }
.task.work { background: var(--work); }
.task.wait { background: repeating-linear-gradient(135deg, #f59e0b, #f59e0b 5px, #fbbf24 5px, #fbbf24 10px); }
.table-wrap { max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
@media (max-width: 1200px) {
  .grid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: 1fr 1fr; }
}
</style></head>
<body>
  <h1>待ち時間と作業時間の区別比較</h1>
  <div class="sub">${escapeHtml(subtitle)}</div>
  <div class="top">${escapeHtml(topInfo)}</div>
  <div class="legend">
    <span><i class="dot work"></i>作業（待ち時間ではない）</span>
    <span><i class="dot wait"></i>待ち（受動調理）</span>
    <span><i class="dot idle"></i>空き時間</span>
  </div>
  <div class="grid">
    ${renderSection(sections[0])}
    ${renderSection(sections[1])}
  </div>
</body></html>`;

  const outHtml = path.join(outDir, "wait-vs-work.html");
  fs.writeFileSync(outHtml, html);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 2600 } });
  await page.goto(`file://${outHtml}`, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "wait-vs-work-full.png"), fullPage: true });
  await page.screenshot({ path: path.join(outDir, "wait-vs-work-top.png"), clip: { x: 0, y: 0, width: 1800, height: 1000 } });
  await browser.close();

  const summary = {
    input_compare_html: inHtml,
    output_html: outHtml,
    output_images: [
      path.join(outDir, "wait-vs-work-full.png"),
      path.join(outDir, "wait-vs-work-top.png"),
    ],
    note: "待ち時間分類はタスク文言ベース（煮込み/蒸らし/放置/分間煮る など）",
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
