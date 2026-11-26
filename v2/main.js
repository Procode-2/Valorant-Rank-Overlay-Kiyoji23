
const urlParams = new URLSearchParams(window.location.search);

const config = {
  regiao: urlParams.get("regiao") || "",
  idusuario: urlParams.get("idusuario") || "",
  nmusuario: urlParams.get("nmusuario") || "",
  cor: urlParams.get("color") || "",
  corfonte: urlParams.get("fontcolor") || "",
  alpha: urlParams.get("alpha") || "",
  bgurl: urlParams.get("bu") || "",
  icourl: urlParams.get("iu") || "",
  semWl: urlParams.has("swl"),
  apikey: urlParams.get("apikey") || "",
  sessionStartMatchId: urlParams.get("sessionStartMatchId") || "",
  sessionStartDateRaw: Number(urlParams.get("sessionStartDateRaw") || 0),
};

const dom = {
  rootStyle: document.documentElement.style,
  imgRank: document.getElementById("imgRank"),
  textoNmRank: document.getElementById("textonmrank"),
  imgCantinho: document.getElementById("imgcantinho"),
  headerRank: document.getElementById("headerburrao"),
  wlValue: document.getElementById("WLvalue"),
  ultMmr: document.getElementById("ultmmr"),
  ultimaPartida: document.getElementById("ultimapartida"),
  mmrAtual: document.getElementById("mmratual"),
};

const API_BASE = "https://api.henrikdev.xyz/valorant";

const state = {
  puuid: null,
  wins: 0,
  losses: 0,
  lastMatchId: null,
  processedMatchIds: new Set(),
  sessionRR: 0,
  processedRrMatchIds: new Set(),
  sessionRrInitialized: false,
};

const SESSION_CHANNEL_NAME = "valorant-session-control";
let lastSessionEventId = null;

function applySessionBaseline(message) {
  if (
    !message ||
    message.type !== "start-session" ||
    !Number(message.dateRaw)
  ) {
    return;
  }

  if (message.eventId && message.eventId === lastSessionEventId) return;
  lastSessionEventId = message.eventId || null;

  config.sessionStartMatchId = message.matchId || "";
  config.sessionStartDateRaw = Number(message.dateRaw);

  state.sessionStartMatchId = config.sessionStartMatchId;
  state.sessionStartDateRaw = config.sessionStartDateRaw;
  state.sessionRR = 0;
  state.processedRrMatchIds.clear();
  state.sessionRrInitialized = true;

  renderSessionRR();
  updateSessionRR().catch((error) =>
    console.error("Could not refresh Stream Progress after session reset:", error)
  );
}

if ("BroadcastChannel" in window) {
  const sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  sessionChannel.addEventListener("message", (event) => {
    applySessionBaseline(event.data);
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== "valorant-session-control" || !event.newValue) return;

  try {
    applySessionBaseline(JSON.parse(event.newValue));
  } catch (error) {
    console.error("Invalid session reset message:", error);
  }
});

function buildApiUrl(path, queryParams = {}) {
  const url = new URL(`${API_BASE}${path}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  if (config.apikey) {
    url.searchParams.set("api_key", config.apikey);
  }

  return url.toString();
}

async function fetchJson(path, queryParams = {}) {
  const response = await fetch(buildApiUrl(path, queryParams));
  return response.json();
}

function applyInitialStyles() {
  if (!config.apikey) {
    dom.imgRank.style.visibility = "hidden";
    dom.textoNmRank.style.visibility = "hidden";
    dom.ultMmr.style.visibility = "hidden";
  }

  if (config.alpha === "ss") {
    dom.textoNmRank.style.backgroundColor = "transparent";
  } else if (config.alpha === "nn" && config.cor) {
    dom.textoNmRank.style.backgroundColor = `#${config.cor}`;
  }

  if (config.bgurl) {
    dom.textoNmRank.style.backgroundImage = `url(${config.bgurl})`;
  }

  if (!config.icourl) {
    dom.imgCantinho.style.display = "none";
  } else {
    dom.imgCantinho.style.content = `url(${config.icourl})`;
  }

  if (config.corfonte) {
    const fontColor = `#${config.corfonte}`;
    dom.headerRank.style.color = fontColor;
    dom.wlValue.style.color = fontColor;
  }

  if (config.semWl) {
    dom.headerRank.style.top = "-5px";
    dom.wlValue.style.display = "none";
  }
}

async function fetchLeaderboardRank() {
  try {
    const region = config.regiao.toLowerCase();
    const json = await fetchJson(`/v1/leaderboard/${region}`, {
      name: config.nmusuario,
      tag: config.idusuario,
    });

    if (json.status === 404 || !Array.isArray(json.data) || !json.data[0]) {
      return null;
    }

    return json.data[0].leaderboardRank;
  } catch (error) {
    console.error("Erro ao buscar leaderboard:", error);
    return null;
  }
}

function extractActSeasonData(bySeason = {}) {
  const preferredActs = ["e11a6", "e11aVI"];

  for (const act of preferredActs) {
    if (bySeason[act]) {
      return {
        numberOfGames: bySeason[act].number_of_games ?? 0,
        hasNoData: Boolean(bySeason[act].error),
      };
    }
  }

  const seasonKeys = Object.keys(bySeason);

  if (seasonKeys.length > 0) {
    const latestSeason = bySeason[seasonKeys[seasonKeys.length - 1]];

    return {
      numberOfGames: latestSeason?.number_of_games ?? 0,
      hasNoData: Boolean(latestSeason?.error),
    };
  }

  return { numberOfGames: 0, hasNoData: true };
}

async function updateRank() {
  try {
    const encodedName = encodeURIComponent(config.nmusuario);
    const encodedTag = encodeURIComponent(config.idusuario);

    const json = await fetchJson(
      `/v2/mmr/${config.regiao}/${encodedName}/${encodedTag}`
    );

    if (json.status !== 200 || !json.data?.current_data) {
      return;
    }

    const current = json.data.current_data;

    if (current.currenttier === null && !current.games_needed_for_rating) {
      return;
    }

    const { numberOfGames, hasNoData } = extractActSeasonData(
      json.data.by_season
    );

    const gamesNeeded = Number(current.games_needed_for_rating ?? 0);
    const isUnranked =
      numberOfGames < 1 || (hasNoData && gamesNeeded >= 1);

    let eloText = current.currenttierpatched || "Unranked";
    let tier = Number(current.currenttier ?? 0);
    let rr = Number(current.ranking_in_tier ?? 0);
    let rrText = rr;
    let lastMmrChange = Number(current.mmr_change_to_last_game ?? 0);
    let gamesPlayedInAct = hasNoData ? 0 : numberOfGames;

    if (isUnranked) {
      eloText = "Unranked";
      tier = "Unranked";
      rr = 100;
    } else if (rr > 100) {
      rr = 0;
    }

    dom.imgRank.src = `./Resources/${tier}.png`;

    if (isUnranked) {
      dom.headerRank.innerHTML = eloText;
    } else if (tier === 27) {
      const lbRank = await fetchLeaderboardRank();

      dom.headerRank.innerHTML = lbRank
        ? `${eloText} #${lbRank}`
        : `${eloText} ${rrText}RR`;
    } else {
      dom.headerRank.innerHTML = `${eloText}&nbsp &nbsp;${rrText}RR`;
    }

    let progressPercent = `${rr}%`;
    dom.mmrAtual.innerHTML = rr;

    if (isUnranked) {
      dom.ultimaPartida.innerHTML = `Unranked ${gamesPlayedInAct}/5`;
    } else if (tier >= 24) {
      if (lastMmrChange === 0) {
        dom.ultMmr.style.backgroundColor = "grey";
      } else if (lastMmrChange >= 1) {
        progressPercent = "100%";
      } else if (lastMmrChange <= -1) {
        progressPercent = "0%";
      }
    } else {
      // Stream Progress is rendered by the session tracker below.
    }

    dom.rootStyle.setProperty("--progresspontinho", progressPercent);

    if (config.corfonte) {
      const fontColor = `#${config.corfonte}`;
      dom.headerRank.style.color = fontColor;
      dom.wlValue.style.color = fontColor;
    }
  } catch (error) {
    console.error("Erro ao atualizar rank:", error);
  }
}

function renderWinLoss() {
  dom.wlValue.innerHTML = `${state.wins} Win / ${state.losses} Loss`;
}

async function fetchPuuid() {
  const encodedName = encodeURIComponent(config.nmusuario);
  const encodedTag = encodeURIComponent(config.idusuario);

  const json = await fetchJson(`/v1/account/${encodedName}/${encodedTag}`);
  state.puuid = json?.data?.puuid || null;
}

async function fetchLatestCompetitiveMatch() {
  const encodedName = encodeURIComponent(config.nmusuario);
  const encodedTag = encodeURIComponent(config.idusuario);

  const json = await fetchJson(
    `/v3/matches/${config.regiao}/${encodedName}/${encodedTag}`,
    { mode: "competitive", size: 1 }
  );

  return json?.data?.[0] || null;
}

async function fetchMMRHistory() {
  const encodedName = encodeURIComponent(config.nmusuario);
  const encodedTag = encodeURIComponent(config.idusuario);

  const json = await fetchJson(
    `/v1/mmr-history/${config.regiao}/${encodedName}/${encodedTag}`
  );

  return Array.isArray(json?.data) ? json.data : [];
}

function renderSessionRR() {
  if (!config.sessionStartDateRaw) {
    dom.ultimaPartida.innerHTML = "Stream Progress: Start Session on setup page";
    return;
  }

  const prefix = state.sessionRR > 0 ? "+" : "";
  dom.ultimaPartida.innerHTML =
    `Stream Progress: ${prefix}${state.sessionRR}rr`;
}

async function initializeSessionRR() {
  state.sessionStartMatchId = config.sessionStartMatchId;
  state.sessionStartDateRaw = config.sessionStartDateRaw;
  state.sessionRR = 0;
  state.processedRrMatchIds.clear();
  state.sessionRrInitialized = true;

  renderSessionRR();
}

async function updateSessionRR() {
  if (!state.sessionRrInitialized || !state.sessionStartDateRaw) {
    return;
  }

  const history = await fetchMMRHistory();

  if (!history.length) return;

  for (const entry of history) {
    const matchId = entry?.match_id;

    if (!matchId) continue;

    if (state.sessionStartMatchId && matchId === state.sessionStartMatchId) {
      break;
    }

    if (state.processedRrMatchIds.has(matchId)) continue;

    const matchDate = Number(entry.date_raw || 0);

    if (!matchDate || matchDate <= state.sessionStartDateRaw) {
      continue;
    }

    state.sessionRR += Number(entry.mmr_change_to_last_game || 0);
    state.processedRrMatchIds.add(matchId);
  }

  renderSessionRR();
}

function evaluateMatchOutcome(match) {
  const player = match?.players?.all_players?.find(
    (p) => p.puuid === state.puuid
  );

  if (!player?.team) return null;

  const teamKey = player.team.toLowerCase();
  const redWon = Boolean(match?.teams?.red?.has_won);
  const blueWon = Boolean(match?.teams?.blue?.has_won);
  const isDraw = !redWon && !blueWon;
  const teamWon = Boolean(match?.teams?.[teamKey]?.has_won);

  return { isDraw, teamWon };
}

async function checkWinLoss() {
  try {
    const match = await fetchLatestCompetitiveMatch();
    const matchId = match?.metadata?.matchid;

    if (!matchId || state.processedMatchIds.has(matchId)) {
      renderWinLoss();
      return;
    }

    state.processedMatchIds.add(matchId);

    if (state.lastMatchId && matchId !== state.lastMatchId) {
      const outcome = evaluateMatchOutcome(match);

      if (outcome) {
        if (outcome.teamWon) {
          state.wins += 1;
        } else if (!outcome.isDraw) {
          state.losses += 1;
        }

        state.lastMatchId = matchId;
      }
    } else if (!state.lastMatchId) {
      state.lastMatchId = matchId;
    }

    renderWinLoss();
  } catch (error) {
    console.error("Erro ao atualizar Win/Loss:", error);
  }
}

async function initWinLossTracking() {
  renderWinLoss();

  if (!config.semWl) {
    try {
      await fetchPuuid();

      const firstMatch = await fetchLatestCompetitiveMatch();
      const firstMatchId = firstMatch?.metadata?.matchid;

      if (firstMatchId) {
        state.lastMatchId = firstMatchId;
        state.processedMatchIds.add(firstMatchId);
      }

      setInterval(checkWinLoss, 30000);
    } catch (error) {
      console.error("Erro ao iniciar Win/Loss:", error);
    }
  }

  if (config.sessionStartDateRaw) {
    await initializeSessionRR();

    updateSessionRR().catch((error) =>
      console.error("Erro ao atualizar Stream Progress:", error)
    );

    setInterval(() => {
      updateSessionRR().catch((error) =>
        console.error("Erro ao atualizar Stream Progress:", error)
      );
    }, 30000);
  } else {
    renderSessionRR();
  }
}

function checkLoadingStuck() {
  if (dom.imgRank.src === `${window.location.origin}/v2/Resources/Load.png`) {
    location.reload();
  }
}

async function init() {
  applyInitialStyles();
  setTimeout(checkLoadingStuck, 10000);

  await updateRank();
  setInterval(updateRank, 15000);

  await initWinLossTracking();
}

init();
