(function () {
  const APPS = window.APPS || [];
  const SEGS = [
    { id: "all", label: "All apps" },
    { id: "list", label: "Todo lists" },
    { id: "gtd", label: "GTD & power" },
    { id: "plan", label: "Planners & AI" },
    { id: "work", label: "Workspaces" },
    { id: "habit", label: "Habit & focus" }
  ];
  const SEG_LABEL = Object.fromEntries(SEGS.map(s => [s.id, s.label]));
  const GROUPS = [
    ["Capture", "Capture"], ["Organize", "Organize"], ["Views", "Views"],
    ["Planning", "Plan & time"], ["Focus", "Focus"], ["AI", "AI"],
    ["Collab", "Sharing"], ["Integrations", "Connect"]
  ];
  const QUICK = ["start date", "MCP", "Pomodoro", "habit", "calendar", "voice", "E2E", "Eisenhower", "review", "one-time"];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hl = (s, q) => {
    const safe = esc(s);
    if (!q) return safe;
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    return safe.replace(re, "<mark>$1</mark>");
  };

  let seg = "all", query = "";
  try { seg = localStorage.getItem("atlas-seg") || "all"; } catch (e) {}

  const segsEl = document.getElementById("segs");
  const cardsEl = document.getElementById("cards");
  const resultEl = document.getElementById("result");
  const qEl = document.getElementById("q");

  function haystack(a) {
    const parts = [a.name, a.tag, a.price, a.platforms, a.love, a.hate, a.retention || ""];
    Object.values(a.f).forEach(list => parts.push(...list));
    return parts.join(" \n ").toLowerCase();
  }
  APPS.forEach(a => { a._hay = haystack(a); });

  function renderSegs() {
    segsEl.innerHTML = SEGS.map(s => {
      const n = s.id === "all" ? APPS.length : APPS.filter(a => a.seg === s.id).length;
      const dot = s.id === "all" ? "" : `<i class="dot d-${s.id}"></i>`;
      return `<button class="seg-btn" data-seg="${s.id}" aria-pressed="${s.id === seg}">${dot}${s.label}<span class="n">${n}</span></button>`;
    }).join("");
  }

  function card(a, q) {
    const groups = GROUPS.filter(([k]) => a.f[k] && a.f[k].length).map(([k, label]) => {
      const items = a.f[k].map(x => `<li>${hl(x, q)}</li>`).join("");
      return `<dt>${label}</dt><dd><ul>${items}</ul></dd>`;
    }).join("");
    const ret = a.retention ? `<p class="ret"><span class="sign">↻</span><span>${hl(a.retention, q)}</span></p>` : "";
    return `<article class="card">
      <div class="card-top"><h3>${hl(a.name, q)}</h3><span class="seg-tag"><i class="dot d-${a.seg}"></i>${SEG_LABEL[a.seg]}</span></div>
      <p class="tag">${hl(a.tag, q)}</p>
      <dl class="meta"><dt>Price</dt><dd class="price">${hl(a.price, q)}</dd><dt>Runs on</dt><dd>${hl(a.platforms, q)}</dd></dl>
      <dl class="feat">${groups}</dl>
      <div class="verdict">
        ${ret}
        <p class="plus"><span class="sign">+</span><span>${hl(a.love, q)}</span></p>
        <p class="minus"><span class="sign">−</span><span>${hl(a.hate, q)}</span></p>
      </div>
    </article>`;
  }

  function render() {
    const q = query.trim();
    const ql = q.toLowerCase();
    const list = APPS.filter(a => (seg === "all" || a.seg === seg) && (!ql || a._hay.includes(ql)));
    cardsEl.innerHTML = list.length
      ? list.map(a => card(a, q)).join("")
      : `<div class="empty">No app in this segment mentions “${esc(q)}”. That may be a gap worth owning.</div>`;
    const scope = seg === "all" ? "" : ` in ${SEG_LABEL[seg]}`;
    resultEl.textContent = ql
      ? `${list.length} of ${APPS.filter(a => seg === "all" || a.seg === seg).length} apps${scope} mention “${q}”`
      : `Showing ${list.length} apps${scope}`;
  }

  segsEl.addEventListener("click", e => {
    const b = e.target.closest("[data-seg]");
    if (!b) return;
    seg = b.dataset.seg;
    try { localStorage.setItem("atlas-seg", seg); } catch (err) {}
    renderSegs(); render();
  });
  qEl.addEventListener("input", () => { query = qEl.value; render(); });

  const quickEl = document.getElementById("quick");
  quickEl.insertAdjacentHTML("beforeend", QUICK.map(t => `<button type="button" data-q="${esc(t)}">${esc(t)}</button>`).join(""));
  quickEl.addEventListener("click", e => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    qEl.value = b.dataset.q; query = b.dataset.q; render();
  });

  renderSegs(); render();

  /* ---------- price ladder ---------- */
  const MAX = 30;
  const priced = APPS.filter(a => typeof a.priceMo === "number" && a.priceMo > 0)
    .sort((x, y) => x.priceMo - y.priceMo);
  const ladder = document.getElementById("ladder");
  ladder.innerHTML = priced.map(a => {
    const w = Math.min(a.priceMo, MAX) / MAX * 100;
    const note = a.name === "monday.com" ? " (3-seat min)" : "";
    return `<span class="nm" title="${esc(a.price)}">${esc(a.name)}</span>
      <div class="bar-track"><div class="bar" style="width:${w}%;background:var(--s-${a.seg})"></div><span class="bar-val" style="left:${w}%">$${a.priceMo.toFixed(2)}${note}</span></div>`;
  }).join("");
  document.getElementById("ticks").innerHTML = [0, 6, 12, 18, 24, 30].map(v => `<span>$${v}</span>`).join("");
  document.getElementById("ladder-legend").innerHTML = SEGS.slice(1).map(s => `<span><i class="dot d-${s.id}"></i>${s.label}</span>`).join("");
  const once = APPS.filter(a => a.priceMo === 0).map(a => a.name);
  document.getElementById("onetime").innerHTML = `<b>Free or buy-once:</b> ${once.map(esc).join(" · ")}`;

  /* ---------- why people quit ---------- */
  const QUIT = [
    ["Backlog bloat & overdue guilt", "Red counts pile up until users declare “TODO bankruptcy” and stop opening the app"],
    ["Setup overhead", "Tuning the system replaces doing the work — “productivity theater”"],
    ["System doesn’t fit how I think", "Leads to app-hopping; one blogger switches “like underwear”"],
    ["Tasks disconnected from time", "“A list without your calendar is paralyzing”; unclear what to do next"],
    ["Price hikes & subscription fatigue", "Todoist’s ~40% rise; “not interested in another rent payment”"],
    ["Lock-in & shutdown risk", "“What if the app goes away?” — proven by Height and Clockwise"],
    ["Feature bloat & dense UI", "“Recreating the same bloat”; ADHD users: less is more"],
    ["Notification fatigue", "Alerts get ignored, yet users also want persistent nudges"],
    ["Fragmentation across tools", "Tasks scattered across email, Slack, Jira and notes"],
    ["Mobile parity & sync bugs", "Desktop-only features, Mac-only launches, tasks not updating"],
    ["Billing trust", "Charges after cancelling (TickTick, Akiflow, Motion)"]
  ];
  document.getElementById("quit-rows").innerHTML = QUIT.map(([t, d], i) =>
    `<tr><td class="rank">${String(i + 1).padStart(2, "0")}</td><td><strong>${t}</strong><br><span class="why" style="color:var(--muted);font-size:13.5px">${d}</span></td></tr>`
  ).join("");
})();
