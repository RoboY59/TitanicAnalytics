const app = document.getElementById("app");
const nav = document.querySelector("nav");
const allTHs = [
  "Unknown",
  ...Array.from({ length: 17 }, (_, i) => (i + 1).toString()),
];

let cwlGroupCache = null;
const MY_CLAN_TAG = "2Q2J2PPVR";
const MY_CLAN_NAME = "TitanicImperium";

// --- Caching-Helpers ---
function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
}

function getCache(key, maxAgeMs) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < maxAgeMs) return data;
  } catch (e) {}
  return null;
}

// --- API-Wrapper mit Caching ---
async function getCWLGroupInfo() {
  const cacheKey = "cwlGroupCache";
  const maxAge = 60 * 60 * 1000; // 1 Stunde
  const cached = getCache(cacheKey, maxAge);
  if (cached) return cached;
  const res = await fetch("/api/cwl/group");
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

async function getClanInfo(clanTag) {
  const cacheKey = "clanInfo_" + clanTag;
  const maxAge = 60 * 60 * 1000;
  const cached = getCache(cacheKey, maxAge);
  if (cached) return cached;
  const res = await fetch(`/api/clan/${encodeURIComponent(clanTag)}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

async function getClanWarlog(clanTag) {
  const cacheKey = "clanWarlog_" + clanTag;
  const maxAge = 60 * 60 * 1000;
  const cached = getCache(cacheKey, maxAge);
  if (cached) return cached;
  const res = await fetch(`/api/clan/${encodeURIComponent(clanTag)}/warlog`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

// Caching für fehlende Spieler
async function getMissingPlayers() {
  const cacheKey = "cwlMissingCache";
  const maxAge = 60 * 60 * 1000; // 1 Stunde
  const cached = getCache(cacheKey, maxAge);
  if (cached) return cached;
  const res = await fetch("/api/cwl/missing");
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

// --- Navigation ---
window.addEventListener("DOMContentLoaded", async () => {
  await buildDynamicNav();
  route();
});
window.addEventListener("hashchange", route);

async function buildDynamicNav() {
  nav.innerHTML = `<a href="#overview">Übersicht</a>`;

  try {
    cwlGroupCache = await getCWLGroupInfo();
    // Unser Clan immer zuerst
    const myClan = cwlGroupCache.clans.find(
      (c) => c.tag.replace("#", "") === MY_CLAN_TAG
    );
    if (myClan) {
      nav.innerHTML += `<a href="#clan/${MY_CLAN_TAG}">${myClan.name}</a>`;
    }
    cwlGroupCache.clans
      .filter((c) => c.tag.replace("#", "") !== MY_CLAN_TAG)
      .forEach((clan) => {
        nav.innerHTML += `<a href="#clan/${encodeURIComponent(
          clan.tag.replace("#", "")
        )}">${clan.name}</a>`;
      });
  } catch (e) {
    nav.innerHTML += `<span style="color:red;">(Fehler beim Laden der CWL)</span>`;
  }
}

function route() {
  const hash = window.location.hash || "#overview";
  if (hash === "#overview") {
    renderOverview();
  } else if (hash.startsWith("#clan/")) {
    const clanTag = hash.split("/")[1];
    renderClanDetail(clanTag);
  }
}

function renderOverview() {
  app.innerHTML = `
    <table id="thTable">
      <thead><tr><th>TH</th></tr></thead>
      <tbody></tbody>
    </table>
    <div id="loading">Lade Daten...</div>
  `;

  // Platzhalter-Zeilen
  const tbody = document.querySelector("#thTable tbody");
  allTHs.forEach((th) => {
    let row = `<tr><td>${th}</td><td colspan="1">-</td></tr>`;
    tbody.innerHTML += row;
  });

  // Daten automatisch laden
  fetchCWLData().then(() => renderMissingPlayers());
}

// 🌍 API-Daten holen & Tabelle bauen (mit Frontend-Cache)
async function fetchCWLData() {
  const cacheKey = "cwlOverviewCache";
  const maxAge = 60 * 60 * 1000; // 1 Stunde
  const loadingDiv = document.getElementById("loading");
  let data = getCache(cacheKey, maxAge);
  if (data) {
    await updateTable(data);
    if (loadingDiv) loadingDiv.remove();
    return;
  }
  try {
    const res = await fetch("/api/cwl");
    data = await res.json();
    setCache(cacheKey, data);
    await updateTable(data);
    if (loadingDiv) loadingDiv.remove();
  } catch (e) {
    if (loadingDiv) loadingDiv.textContent = "Fehler beim Laden der Daten!";
  }
}

// 📊 Tabelle mit TH-Verteilung aktualisieren (optimiert)
async function updateTable(data) {
  const table = document.getElementById("thTable");
  const tbody = table.querySelector("tbody");
  let buffer = "";

  // Alle Clannamen sammeln
  const clanNames = new Set();
  Object.values(data).forEach((clanMap) => {
    Object.keys(clanMap).forEach((name) => clanNames.add(name));
  });
  const clanList = [...clanNames];

  // Fehlende Spieler holen (aus Cache!)
  let missingMap = {};
  try {
    const missingData = await getMissingPlayers();
    if (missingData.missing) {
      missingData.missing.forEach((m) => {
        if (!missingMap[m.clan]) missingMap[m.clan] = {};
        const th = m.th ? m.th.toString() : "Unknown";
        missingMap[m.clan][th] = (missingMap[m.clan][th] || 0) + 1;
      });
    }
  } catch (e) {}

  // Kopfzeile
  const theadRow = table.querySelector("thead tr");
  theadRow.innerHTML =
    "<th>TH</th>" + clanList.map((n) => `<th>${n}</th>`).join("");

  // Für jede TH-Zeile
  allTHs.forEach((th) => {
    let row = `<tr><td>${th}</td>`;
    clanList.forEach((name) => {
      const val = data[th]?.[name] || 0;
      const color = getColorByValue(val);
      const missing =
        missingMap[name] && missingMap[name][th] ? missingMap[name][th] : 0;
      let cell = val;
      if (missing > 0) {
        cell += ` <span style="color:#e53e3e;">(-${missing})</span>`;
      }
      row += `<td class="${
        val === 0 ? "zero" : "value"
      }" style="background-color: ${color};">${cell}</td>`;
    });
    row += "</tr>";
    buffer += row;
  });

  // Mitgliederzahlen aus /api/cwl/group holen (mit Caching)
  let groupData;
  try {
    groupData = await getCWLGroupInfo();
  } catch (e) {
    groupData = null;
  }

  // Totals für jeden Clan berechnen und als eigene Zeile anhängen
  let totalRow = `<tr><td><b>Total</b></td>`;
  clanList.forEach((name) => {
    let mitglieder = "?";
    if (groupData && groupData.clans) {
      const clan = groupData.clans.find((c) => c.name === name);
      if (clan && Array.isArray(clan.members)) {
        mitglieder = clan.members.length;
      } else if (clan && typeof clan.members === "number") {
        mitglieder = clan.members;
      }
    }
    totalRow += `<td class="value"><b>${mitglieder}</b></td>`;
  });
  totalRow += "</tr>";
  buffer += totalRow;

  // Schreibe alles auf einmal ins DOM
  tbody.innerHTML = buffer;
}

// 🌈 Regenbogen-Farbverlauf (Grün → Gelb → Orange → Rot)
function getColorByValue(val) {
  if (val === 0) return "#f7fafc"; // grau für 0
  const clamped = Math.min(val, 20);
  const stops = [
    { stop: 0, r: 0, g: 200, b: 0 }, // grün
    { stop: 5, r: 128, g: 200, b: 0 }, // gelbgrün
    { stop: 10, r: 255, g: 255, b: 0 }, // gelb
    { stop: 15, r: 255, g: 165, b: 0 }, // orange
    { stop: 20, r: 255, g: 0, b: 0 }, // rot
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const curr = stops[i];
    const next = stops[i + 1];
    if (clamped >= curr.stop && clamped <= next.stop) {
      const ratio = (clamped - curr.stop) / (next.stop - curr.stop);
      const r = Math.round(curr.r + ratio * (next.r - curr.r));
      const g = Math.round(curr.g + ratio * (next.g - curr.g));
      const b = Math.round(curr.b + ratio * (next.b - curr.b));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return `rgb(255, 0, 0)`; // fallback = rot
}

// Spieler, die den Clan seit CWL-Start verlassen haben
async function renderMissingPlayers() {
  const data = await getMissingPlayers();
  const container = document.createElement("div");
  container.style.marginTop = "2rem";
  container.innerHTML =
    "<h3>Spieler, die den Clan seit CWL-Start verlassen haben:</h3>";
  if (data.missing && data.missing.length > 0) {
    container.innerHTML +=
      "<ul>" +
      data.missing
        .map(
          (m) =>
            `<li>${m.name} (${m.tag}) – Clan: <b>${m.clan}</b>, TH: <b>${m.th}</b></li>`
        )
        .join("") +
      "</ul>";
  } else {
    container.innerHTML += "<i>Keine Spieler haben den Clan verlassen.</i>";
  }
  app.appendChild(container);
}

// Detailansicht für einen Clan
async function renderClanDetail(clanTag) {
  app.innerHTML = `<div id="clan-header">Lade Clan-Daten...</div>`;

  // Liga-Gruppe laden (falls noch nicht im Cache)
  if (!cwlGroupCache) cwlGroupCache = await getCWLGroupInfo();

  // Unser Clan aus Liga-Gruppe (CWL-Aufstellung)
  const myClan = cwlGroupCache.clans.find(
    (c) => c.tag.replace("#", "") === MY_CLAN_TAG
  );
  const myMembers = Array.isArray(myClan?.members) ? myClan.members : [];
  const sortedOurMembers = [...myMembers].sort(
    (a, b) => (b.townHallLevel || 0) - (a.townHallLevel || 0)
  );

  // Gegner-Clan aus Liga-Gruppe
  const clan = cwlGroupCache.clans.find(
    (c) => c.tag.replace("#", "") === clanTag
  );

  if (clan) {
    let mitglieder = Array.isArray(clan.members)
      ? clan.members.length
      : typeof clan.members === "number"
      ? clan.members
      : "?";
    document.getElementById("clan-header").innerHTML = `
      <div style="border:2px solid #888; border-radius:8px; background:#f7fafc; margin-bottom:1rem; padding:1rem;">
        <span style="font-size:2rem; font-weight:bold; vertical-align:middle;">${
          clan.name
        }</span>
        <span style="font-size:1.2rem; color:#3182ce; margin-left:0.7em; vertical-align:middle;">(Lvl ${
          clan.clanLevel || "?"
        })</span>
        <span style="font-size:1.2rem; color:#38a169; margin-left:1.5em; vertical-align:middle;">Mitglieder: ${mitglieder}</span>
      </div>
    `;

    // Layout: links Mitgliederliste, rechts Vergleichstabelle
    let html = `<div style="display:flex; gap:2rem; align-items:flex-start;">`;

    // 1. Mitgliederliste des angezeigten Clans (links, nach TH absteigend sortiert)
    const sortedMembers = Array.isArray(clan.members)
      ? [...clan.members].sort(
          (a, b) => (b.townHallLevel || 0) - (a.townHallLevel || 0)
        )
      : [];
    html += `<div style="flex:1; min-width:220px;">
      <h3>Mitglieder (nur CWL-Aufstellung):</h3>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;">Name</th>
            <th>TH</th>
          </tr>
        </thead>
        <tbody>
          ${sortedMembers
            .map(
              (m) => `
            <tr>
              <td style="text-align:left;">${m.name}</td>
              <td style="text-align:center;">${m.townHallLevel || "?"}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

    // 2. Vergleichstabelle (rechts, links IMMER unser Clan)
    html += `<div style="flex:2; min-width:320px;" id="compare-table">Lade Vergleich...</div>`;
    html += `</div>`;
    app.innerHTML += html;

    // Vergleichstabelle laden (unsere CWL-Aufstellung, Gegner = aktueller Clan)
    renderClanVsClanTable(
      sortedOurMembers.slice(0, 15),
      clan.members,
      clan.name
    );

    // Kriegslog anzeigen (NUR unter der Vergleichstabelle)
    renderClanWarlog(clan.tag.replace("#", ""));
  } else {
    document.getElementById("clan-header").textContent = "Clan nicht gefunden.";
  }
}

// Vergleichstabelle: Top 15 unserer CWL-Aufstellung vs. Top 15 Gegner
function renderClanVsClanTable(ourTop, oppMembers, opponentName) {
  // 1. Gegner-Mitglieder (aus Liga-Gruppe)
  const oppTop = Array.isArray(oppMembers)
    ? [...oppMembers]
        .sort((a, b) => (b.townHallLevel || 0) - (a.townHallLevel || 0))
        .slice(0, 15)
    : [];

  // 2. Baue die Tabelle
  let table = `
    <h3>Top 15 Vergleich: ${MY_CLAN_NAME} vs. ${opponentName || "?"}</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Unser Spieler (TH)</th>
          <th>Gegner Spieler (TH)</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (let i = 0; i < 15; i++) {
    const our = ourTop[i] || {};
    const opp = oppTop[i] || {};
    const ourTH = our.townHallLevel || 0;
    const oppTH = opp.townHallLevel || 0;
    const diff = oppTH - ourTH;
    let color = "#000";
    let bg = "#fff";
    if (diff >= 3) {
      color = "#e53e3e";
      bg = "#fde8e8";
    } // kräftiges Rot
    else if (diff === 2) {
      color = "#ed8936";
      bg = "#fff7e6";
    } // kräftiges Orange
    else if (diff === 1) {
      color = "#ecc94b";
      bg = "#fefcbf";
    } // kräftiges Gelb
    else if (diff === 0) {
      color = "#38a169";
      bg = "#e6fffa";
    } // kräftiges Grün
    else if (diff <= -1) {
      color = "#3182ce";
      bg = "#ebf8ff";
    } // kräftiges Blau

    table += `
    <tr>
      <td>${i + 1}</td>
      <td>${our.name || "-"} (TH ${ourTH || "-"})</td>
      <td style="background:${bg}; color:${color}; font-weight:bold;">
        ${opp.name || "-"} (TH ${oppTH || "-"})
      </td>
      <td style="color:${color}; font-weight:bold; background:${bg};">${
      diff > 0 ? "+" : ""
    }${diff}</td>
    </tr>
  `;
  }

  table += "</tbody></table>";

  document.getElementById("compare-table").innerHTML = table;
}

// Kriegslog für einen Clan anzeigen (Clash of Clans Stil, NUR unter Vergleichstabelle)
async function renderClanWarlog(clanTag) {
  const container = document.createElement("div");
  container.style.marginTop = "2rem";
  container.innerHTML = "<h3>Vergangene CWL-Kriege:</h3>";

  try {
    const data = await getClanWarlog(clanTag);

    if (data.private) {
      container.innerHTML += "<i>Kriegslog Privat</i>";
    } else if (
      data.items &&
      Array.isArray(data.items) &&
      data.items.length > 0
    ) {
      container.innerHTML += `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${data.items
            .slice(0, 5)
            .map((item) => {
              // Bestimme, welches Clanobjekt "wir" sind
              const isHome =
                item.clan &&
                item.clan.tag &&
                item.clan.tag.replace("#", "") === clanTag.replace("#", "");
              const home = isHome ? item.clan : item.opponent;
              const away = isHome ? item.opponent : item.clan;
              const homeName = home ? home.name : "-";
              const awayName = away ? away.name : "-";
              const homeStars = home ? home.stars : 0;
              const awayStars = away ? away.stars : 0;
              const homeMembers =
                home && typeof home.members === "number" ? home.members : "?";
              const awayMembers =
                away && typeof away.members === "number" ? away.members : "?";
              const homeDestruction =
                home && home.destructionPercentage !== undefined
                  ? home.destructionPercentage.toFixed(2)
                  : "-";
              const awayDestruction =
                away && away.destructionPercentage !== undefined
                  ? away.destructionPercentage.toFixed(2)
                  : "-";
              const resultIcon =
                item.result === "win"
                  ? "🏆"
                  : item.result === "lose"
                  ? "💀"
                  : "🤝";
              // Gewinnername hervorheben
              let homeStyle = "font-weight:bold;";
              let awayStyle = "font-weight:bold;";
              if (item.result === "win") homeStyle += "color:#38a169;";
              if (item.result === "lose") awayStyle += "color:#e53e3e;";

              // Kriegsgröße berechnen (max Sterne / 3, auf nächste 5 runden)
              let warSize = Math.max(homeStars, awayStars) / 3;
              warSize = Math.ceil(warSize / 5) * 5;

              return `
              <div style="background:#f7fafc; border-radius:8px; border:1px solid #e2e8f0; padding:0.7rem 1.2rem; margin-bottom:0.5rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; font-size:1.1em;">
                  <span style="${homeStyle}">${homeName}</span>
                  <span style="font-size:0.95em; color:#888;">${warSize} vs ${warSize}</span>
                  <span style="${awayStyle}">${awayName}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.3em; font-size:1em;">
                  <span>
                    <b>${homeDestruction}%</b>
                    <span style="color:#f6ad55; font-weight:bold; margin-left:0.5em;">${homeStars} ⭐</span>
                  </span>
                  <span style="font-size:1.3em; font-weight:bold; color:#444;">${resultIcon}</span>
                  <span>
                    <span style="color:#f6ad55; font-weight:bold; margin-right:0.5em;">${awayStars} ⭐</span>
                    <b>${awayDestruction}%</b>
                  </span>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    } else {
      container.innerHTML += "<i>Kein Kriegslog gefunden.</i>";
    }
  } catch (e) {
    container.innerHTML += "<i>Fehler beim Laden des Kriegslogs.</i>";
  }

  // Füge den Kriegslog NUR unter die Vergleichstabelle ein
  const compareTable = document.getElementById("compare-table");
  if (compareTable) {
    compareTable.insertAdjacentElement("afterend", container);
  } else {
    app.appendChild(container);
  }
}
