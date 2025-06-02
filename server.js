const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const NodeCache = require("node-cache");
const apiCache = new NodeCache({ stdTTL: 3600 }); // 1 Stunde

dotenv.config();
const app = express();
const PORT = 3000;
const COC_API_KEY = process.env.COC_API_KEY;
const CLAN_TAG = process.env.CLAN_TAG;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const api = axios.create({
  baseURL: "https://cocproxy.royaleapi.dev/v1",
  headers: { Authorization: `Bearer ${COC_API_KEY}` },
});

app.get("/api/cwl", async (req, res) => {
  const cacheKey = "cwlTable";
  const cached = apiCache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  try {
    const clanTag = encodeURIComponent("#" + CLAN_TAG);
    const leagueGroup = await api.get(
      `/clans/${clanTag}/currentwar/leaguegroup`
    );
    const clans = leagueGroup.data.clans;
    const result = {};
    for (const clan of clans) {
      const name = clan.name;
      const members = Array.isArray(clan.members) ? clan.members : [];
      members.forEach((member) => {
        let th = member.townHallLevel;
        if (!th || th < 1) th = "Unknown";
        else th = th.toString();
        if (!result[th]) result[th] = {};
        result[th][name] = (result[th][name] || 0) + 1;
      });
    }
    apiCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      res
        .status(404)
        .json({ error: "CWL nicht gefunden oder Clan-Tag falsch." });
    } else {
      res.status(500).json({ error: "Serverfehler", details: err.message });
    }
  }
});

app.get("/api/cwl/group", async (req, res) => {
  try {
    const clanTag = encodeURIComponent("#" + CLAN_TAG);
    const group = await api.get(`/clans/${clanTag}/currentwar/leaguegroup`);
    res.json(group.data);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      res
        .status(404)
        .json({ error: "CWL nicht gefunden oder Clan-Tag falsch." });
    } else {
      res.status(500).json({ error: "Serverfehler", details: err.message });
    }
  }
});

app.get("/api/cwl/war/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const clanTag = encodeURIComponent("#" + CLAN_TAG);
    const group = await api.get(`/clans/${clanTag}/currentwar/leaguegroup`);
    const round = group.data.rounds[index - 1];
    const war = await api.get(
      `/clanwarleagues/wars/${encodeURIComponent(round.warTag)}`
    );
    res.json(war.data);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      res
        .status(404)
        .json({ error: "Kriegstag nicht gefunden oder Clan-Tag falsch." });
    } else {
      res.status(500).json({ error: "Serverfehler", details: err.message });
    }
  }
});

app.get("/api/clan/:tag", async (req, res) => {
  try {
    const tag = encodeURIComponent("#" + req.params.tag);
    const clan = await api.get(`/clans/${tag}`);
    res.json(clan.data);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Fehler beim Laden des Clans", details: err.message });
  }
});

app.get("/api/clan/:tag/warlog", async (req, res) => {
  try {
    const tag = encodeURIComponent("#" + req.params.tag);
    const log = await api.get(`/clans/${tag}/warlog`);
    res.json(log.data);
  } catch (e) {
    if (e.response && e.response.status === 403) {
      res.json({ private: true });
    } else if (e.response && e.response.status === 404) {
      res.status(404).json({ error: "Clan nicht gefunden." });
    } else {
      res.status(500).json({ error: "Serverfehler", details: e.message });
    }
  }
});

app.get("/api/cwl/missing", async (req, res) => {
  try {
    const clanTag = encodeURIComponent("#" + CLAN_TAG);

    // 1. Liga-Gruppe holen
    const leagueGroup = await api.get(
      `/clans/${clanTag}/currentwar/leaguegroup`
    );
    // Alle Clans der Liga-Gruppe durchgehen
    let missing = [];
    for (const cwlClan of leagueGroup.data.clans) {
      const members = Array.isArray(cwlClan.members) ? cwlClan.members : [];
      // 2. Aktuelle Clanliste holen
      const clanData = await api.get(
        `/clans/${encodeURIComponent(cwlClan.tag)}`
      );
      const currentMembers = Array.isArray(clanData.data.memberList)
        ? clanData.data.memberList.map((m) => m.tag)
        : [];
      // 3. Vergleichen
      members.forEach((m) => {
        if (!currentMembers.includes(m.tag)) {
          missing.push({
            name: m.name,
            tag: m.tag,
            clan: cwlClan.name,
            th: m.townHallLevel || "?",
          });
        }
      });
    }
    res.json({ missing });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Fehler beim Vergleich", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server läuft unter http://localhost:${PORT}`);
});
