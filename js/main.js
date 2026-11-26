
const copyText = document.getElementById("linkUrl"),
revealEffect = document.querySelectorAll('.reveal'),
frame = document.querySelector("iframe"),
copyLink = document.querySelector("#copyLink"),
startSessionButton = document.querySelector("#startSessionButton"),
sessionMessage = document.querySelector("#sessionMessage");

let sessionStartMatchId = "";
let sessionStartDateRaw = 0;

const SESSION_CHANNEL_NAME = "valorant-session-control";
const sessionChannel =
    "BroadcastChannel" in window ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null;

function sendSessionBaseline() {
    const message = {
        type: "start-session",
        eventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        matchId: sessionStartMatchId,
        dateRaw: sessionStartDateRaw
    };

    if (sessionChannel) sessionChannel.postMessage(message);

    try {
        localStorage.setItem("valorant-session-control", JSON.stringify(message));
    } catch (error) {
        console.warn("Could not write session event to local storage:", error);
    }
}

(() => {
    setTimeout(() => {
        document.querySelector("#pfp").classList.add("float-effect");
    }, 1000);

    ["bu", "iu", "color", "fontcolor"].forEach((e) => {
        let locVal = localStorage.getItem(e);
        console.log("loc", e, locVal);
        if (locVal) {
            document.querySelector('input[name="' + e + '"]').value =
                localStorage.getItem(e);
        }
    });

    const locAlpha = localStorage.getItem("alpha");
    console.log(locAlpha);
    document.querySelector('input[name="alpha"]').checked =
        locAlpha && locAlpha != "false";
})();

document.querySelectorAll("#closeDropdown, #toggleMenu").forEach((e) =>
    e.addEventListener("click", () => {
        const menu = document.querySelector("#menu");
        if (menu.classList.contains("hidden")) {
            menu.classList.remove("hidden");
            menu.classList.add("flex", "reveal-r", "active");
            return;
        }
        menu.classList.add("hidden");
        menu.classList.remove("flex", "reveal-r", "active");
    })
);

copyLink.addEventListener("click", () => {
    if (!copyText.value) return;
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
});

copyText.addEventListener("focus", (e) => {
    e.target.select();
    e.target.setSelectionRange(0, 99999);
});

const fields = document.querySelectorAll("input[name], select[name]"),
    validationRule = {
        default: (v, k) => !k || !!v?.length,
        color: (v, k) => {
            localStorage.setItem(k, v);
            return [true, v.replace("#", "")];
        },
        fontcolor: (v, k) => validationRule.color(v, k),
        alpha: (v, k) => {
            localStorage.setItem(k, v);
            return [true, v ? "ss" : "nn"];
        },
        bu: (v, k) => {
            localStorage.setItem(k, v || "");
            return [true, v || ""];
        },
        iu: (v, k) => validationRule.bu(v, k),
    };

let timeoutQuery;
fields.forEach((e) => {
    e.addEventListener("keyup", changes);
    e.addEventListener("change", changes);
});

function changes() {
    if (!isValid()) {
        copyText.value = "";
        copyLink.classList.add("hidden");
        startSessionButton.classList.add("hidden");
        frame.classList.add("hidden");
        sessionMessage.textContent = "";
        return;
    }

    const farea = document.getElementById("frame-area");
    farea.classList.add("loading");
    frame.classList.add("hidden");

    if (timeoutQuery) clearTimeout(timeoutQuery);

    timeoutQuery = setTimeout(() => {
        let requestParams = {};
        farea.classList.remove("loading");

        if (isValid(requestParams)) {
            console.log("requestParams", requestParams);

            let params = "";

            if (sessionStartDateRaw) {
                requestParams.sessionStartMatchId = sessionStartMatchId;
                requestParams.sessionStartDateRaw = sessionStartDateRaw;
            }

            for (let x in requestParams) {
                params += `${encodeURIComponent(x)}=${encodeURIComponent(requestParams[x])}&`;
            }

            params = params.slice(0, -1);
            console.log("params", params);

            copyLink.classList.remove("hidden");
            startSessionButton.classList.remove("hidden");

            if (sessionStartDateRaw) {
                sessionMessage.textContent =
                    "Session baseline set. The OBS overlay will use this baseline when it loads.";
            }

            frame.classList.remove("hidden");
            const overlayUrl = new URL("./v2/main.html", window.location.href);
            overlayUrl.search = params;

            frame.src = copyText.value = overlayUrl.toString();

            console.log("update");
            return;
        }
    }, 2000);
}

function isValid(requestParams = {}) {
    return [...fields].every((e) => {
        let u = (validationRule[e.name] || validationRule.default)(
            e.getAttribute("type") == "checkbox" ? e.checked : e.value,
            e.name
        );

        console.log(e.name, u);

        if (typeof u === "boolean") {
            requestParams[e.name] = e.value;
            return u;
        }

        const [bol, newVal] = u;
        requestParams[e.name] = newVal;
        return bol;
    });
}

async function startSession() {
    const nickname = document.querySelector('input[name="nmusuario"]').value.trim();
    const tag = document.querySelector('input[name="idusuario"]').value.trim();
    const region = document.querySelector('select[name="regiao"]').value;
    const apiKey = document.querySelector('input[name="apikey"]').value.trim();

    if (!nickname || !tag || !region || !apiKey) {
        sessionMessage.textContent = "Fill in your nickname, ID, region, and API key first.";
        return;
    }

    startSessionButton.disabled = true;
    startSessionButton.textContent = "Starting...";
    sessionMessage.textContent = "Getting your latest completed match...";

    try {
        const historyUrl = new URL(
            `https://api.henrikdev.xyz/valorant/v1/mmr-history/${encodeURIComponent(region)}/${encodeURIComponent(nickname)}/${encodeURIComponent(tag)}`
        );

        historyUrl.searchParams.set("api_key", apiKey);

        const response = await fetch(historyUrl.toString(), { cache: "no-store" });
        const result = await response.json();

        if (!response.ok || result.status !== 200 || !Array.isArray(result.data)) {
            throw new Error(result.error?.message || "HenrikDev could not return your MMR history.");
        }

        const latestMatch = result.data[0] || null;

        sessionStartMatchId = latestMatch?.match_id || "";
        sessionStartDateRaw = Number(
            latestMatch?.date_raw || Math.floor(Date.now() / 1000)
        );

        sendSessionBaseline();
        changes();

        sessionMessage.textContent =
            "Session reset to 0 RR. The reset message has been sent to the OBS overlay.";
    } catch (error) {
        console.error("Could not start RR session:", error);
        sessionMessage.textContent =
            `Could not start session: ${error.message || "API request failed"}`;
    } finally {
        startSessionButton.disabled = false;
        startSessionButton.textContent = "Start Session";
    }
}

startSessionButton.addEventListener("click", startSession);

// Text Observer
const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.intersectionRatio >= 0.2) {
            entry.target.classList.add("active");
        } else {
            entry.target.classList.remove("active");
        }
    });
}, { threshold: 0.2 });

for (var i = 0; i < revealEffect.length; i++) {
    observer.observe(revealEffect[i]);
}
