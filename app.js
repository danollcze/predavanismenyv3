"use strict";

const element = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const boardName = id => `PCB-${String(id).padStart(4, "0")}`;
const machineCode = id => `M${pad(id)}`;
const timeFormatter = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
const statusLabels = {
  idle: "Čeká na desku", running: "V provozu", moving: "Deska v pohybu", blocked: "Výstup blokován",
  fault: "Porucha", repairing: "Technik opravuje", restarting: "Rozjezd stroje",
  empty: "Buffer prázdný", waiting: "Desky čekají", full: "Buffer plný", stopped: "Pás zastaven"
};
const activitySeries = {
  machine: [
    { id: "work", label: "Práce — návrat k nule ↓", color: "#4af0ba", states: ["running"], descending: true },
    { id: "waiting", label: "Čekání / blokace / rozjezd ↑", color: "#ffc66c", states: ["idle", "blocked", "restarting"], descending: false },
    { id: "fault", label: "Chyba / oprava ↑", color: "#ff7587", states: ["fault", "repairing"], descending: false }
  ],
  conveyor: [
    { id: "moving", label: "Pohyb desky — návrat k nule ↓", color: "#4af0ba", states: ["moving"], descending: true },
    { id: "blocked", label: "Blokovaný výstup / zastavený pás ↑", color: "#ffc66c", states: ["blocked", "stopped"], descending: false },
    { id: "idle", label: "Čekání na desku ↑", color: "#ffc66c", states: ["idle"], descending: false }
  ],
  buffer: [
    { id: "empty", label: "Volná kapacita — návrat k nule při vyprázdnění ↓", color: "#4af0ba", states: ["empty"], descending: true },
    { id: "waiting", label: "Čekající desky / zbývá kapacita ↑", color: "#ffc66c", states: ["waiting"], descending: false },
    { id: "full", label: "Plný buffer / blokovaný vstup ↑", color: "#ffc66c", states: ["full"], descending: false }
  ]
};
const incidentLabels = {
  waiting: "Čeká na technika", dispatched: "Technik na cestě", repairing: "Probíhá oprava",
  restarting: "Probíhá rozjezd", resolved: "Vyřešeno"
};
const isTestLine = document.body.dataset.mode === "test";
let testSettings = isTestLine ? LineSimulation.defaultSettings() : null;
if (isTestLine) {
  element("single-board").checked = true;
  element("single-board").disabled = true;
  element("auto-faults").checked = false;
}
function createDemo() {
  const singleBoard = element("single-board").checked;
  const warmup = singleBoard || isTestLine ? 0 : 180;
  const demo = new LineSimulation({
    singleBoard, manualFeed: isTestLine, settings: isTestLine ? testSettings : undefined,
    baseTime: Date.now() - warmup * 1000
  });
  demo.autoFaults = false;
  demo.advance(warmup);
  demo.autoFaults = element("auto-faults").checked;
  demo.nextFaultAt = demo.time + demo.settings.faults.firstAfter;
  if (isTestLine) demo.running = false;
  return demo;
}

let simulation = createDemo();
let speed = Number(element("speed").value);
let selectedMachineId = null;
let selectedConveyorId = null;
let selectedBufferId = null;
let selectedBoardId = null;
let trackedBoardId = null;
let lastFollowKey = null;
let lastFrame = null;
let lastRender = 0;
let notificationTimer;
const selectedChartIntervals = new Map();
const renderedChartRecords = new Map();

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function number(value) {
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
}

function duration(seconds) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${number(seconds)} s`;
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded / 60) % 60;
  return hours ? `${hours} h ${minutes} min ${rounded % 60} s` : `${minutes} min ${rounded % 60} s`;
}

function clock(seconds) {
  return timeFormatter.format(new Date(simulation.baseTime + seconds * 1000));
}

function timestamp(seconds) {
  if (seconds === null) return "—";
  const date = new Date(simulation.baseTime + seconds * 1000);
  return `<time datetime="${date.toISOString()}" title="${dateFormatter.format(date)}">${clock(seconds)}</time>`;
}

function notify(message) {
  element("notification").textContent = message;
  element("notification").classList.add("visible");
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => element("notification").classList.remove("visible"), 4500);
}

function buildMachines() {
  const connector = '<span class="station-connector" aria-hidden="true">→</span>';
  document.documentElement.style.setProperty("--station-count", simulation.stations.length);
  for (const technology of ["SMT", "THT"]) {
    document.querySelector(`.${technology.toLowerCase()}-band`).style.gridColumn =
      `span ${simulation.stations.filter(station => station.technology === technology).length}`;
  }
  element("line-summary").textContent = `${simulation.machines.length} STROJŮ · ${simulation.conveyors.length} DOPRAVNÍKŮ · ${simulation.buffers.length} BUFFERY`;
  element("machine-line").innerHTML = simulation.stations.map((station, index) => {
    const arrow = index < simulation.stations.length - 1 ? connector : "";
    if (station.kind === "machine") {
      return `<article class="machine-card" id="machine-${station.id}" data-detail-kind="machine" data-detail-id="${station.id}" role="group" tabindex="0" aria-haspopup="dialog" aria-label="${station.code} ${station.name} — Enter otevře detail">
        <div class="machine-top"><span class="machine-number">${station.code}</span><span class="machine-status-dot" aria-hidden="true"></span></div>
        <div class="machine-illustration"><div class="andon" role="img"><span class="andon-lamp red"></span><span class="andon-lamp orange"></span><span class="andon-lamp green"></span></div><div class="machine-display"><button type="button" class="board-chip pcb-button">▦</button></div><div class="machine-base"></div></div>
        <h3>${station.name}</h3><p class="machine-description">${station.description}</p>
        <div class="machine-state"><span class="status-dot"></span><span class="state-text"></span></div>
        <button type="button" class="board-current pcb-button"></button><div class="progress-track"><div class="progress-fill"></div></div>
        <div class="machine-occupancy"><span>Obsazení</span><b class="occupancy-count">0 / 1</b></div>
        <div class="machine-bottom"><span class="processed-count">0 ks</span><button type="button" class="open-detail-hint pcb-button">Detail ↗</button></div>${arrow}
      </article>`;
    }
    if (station.kind === "conveyor") {
      return `<article class="equipment-card conveyor" id="conveyor-${station.id}" data-detail-kind="conveyor" data-detail-id="${station.id}" role="group" tabindex="0" aria-haspopup="dialog" aria-label="${station.id} Dopravník — Enter otevře detail a graf">
        <div class="equipment-code">${station.id}</div><h3>Dopravník</h3><p class="equipment-description">${number(station.speed)} m/min · ${number(station.length)} m<br>Průjezd ${number(station.travelTime)} s · 1 deska</p>
        <div class="belt"><span class="belt-direction" aria-hidden="true">→</span><div class="conveyor-chassis"><div class="belt-track"><button type="button" class="belt-board pcb-button"></button></div><div class="conveyor-legs" aria-hidden="true"><i></i><i></i></div></div></div>
        <p class="equipment-state"></p><button type="button" class="belt-board-id pcb-button"></button>
        <div class="machine-occupancy"><span>Obsazení</span><b class="conveyor-occupancy">0 / 1</b></div>
        <div class="equipment-note">Čeká, pokud je další zařízení obsazené.</div><button type="button" class="open-detail-hint pcb-button">Detail a graf ↗</button>${arrow}
      </article>`;
    }
    return `<article class="equipment-card physical-buffer" id="buffer-${station.id}" data-detail-kind="buffer" data-detail-id="${station.id}" role="group" tabindex="0" aria-haspopup="dialog" aria-label="${station.id} Buffer, kapacita ${station.capacity} desek — Enter otevře detail a graf">
      <div class="equipment-code">${station.id}</div><h3>Buffer</h3><p class="equipment-description">${LineSimulation.bufferModes()[station.mode].name} · ${simulation.bufferCapacity(station)} pozic${station.holdTime ? ` · zdržení ${number(station.holdTime)} s` : ""}</p>
      <div class="buffer-rack">${Array.from({ length: simulation.bufferCapacity(station) }, () => '<button type="button" class="buffer-rack-slot pcb-button"></button>').join("")}</div>
      <p class="equipment-state"></p><div class="buffer-device-count">0 / ${simulation.bufferCapacity(station)}</div>
      <div class="buffer-next"></div><div class="equipment-note">Samostatný zásobník přímo v trase linky.</div><button type="button" class="open-detail-hint pcb-button">Detail a graf ↗</button>${arrow}
    </article>`;
  }).join("");
}

function renderMachines() {
  for (const machine of simulation.machines) {
    const card = element(`machine-${machine.id}`);
    card.dataset.state = machine.state;
    const hasFault = machine.state === "fault" || machine.state === "repairing";
    const andonColor = hasFault ? "red" : simulation.running && machine.state === "running" ? "green" : "orange";
    const andonLabel = hasFault ? `Chyba — ${statusLabels[machine.state]}`
      : !simulation.running ? "Stojí — simulace pozastavena"
      : machine.state === "running" ? "Běží"
      : machine.state === "blocked" ? "Stojí — vstup dalšího zařízení je blokován"
      : `Stojí — ${statusLabels[machine.state]}`;
    card.dataset.andon = andonColor;
    const andon = card.querySelector(".andon");
    andon.setAttribute("aria-label", `Andon: ${andonLabel}`);
    andon.title = andonLabel;
    card.dataset.hasBoard = String(Boolean(machine.board));
    card.querySelector(".state-text").textContent = statusLabels[machine.state];
    card.querySelector(".board-current").textContent = machine.board ? boardName(machine.board.id) : "Bez desky";
    setBoardButtons(card.querySelectorAll(".board-chip, .board-current"), machine.board);
    card.querySelector(".progress-fill").style.width = machine.board
      ? `${(1 - machine.remaining / machine.cycle) * 100}%` : "0%";
    card.querySelector(".occupancy-count").textContent = `${machine.board ? 1 : 0} / ${machine.capacity}`;
    card.querySelector(".processed-count").textContent = `${machine.processed} ks`;
  }
  for (const conveyor of simulation.conveyors) {
    const card = element(`conveyor-${conveyor.id}`);
    card.dataset.state = conveyor.state;
    card.classList.toggle("has-board", Boolean(conveyor.board));
    card.querySelector(".equipment-state").textContent = statusLabels[conveyor.state];
    card.querySelector(".conveyor-occupancy").textContent = `${conveyor.board ? 1 : 0} / ${conveyor.capacity}`;
    card.querySelector(".belt-board-id").textContent = conveyor.board ? boardName(conveyor.board.id) : "Bez desky";
    setBoardButtons(card.querySelectorAll(".belt-board, .belt-board-id"), conveyor.board);
    if (conveyor.board) {
      const progress = Math.min(1, Math.max(0,
        (conveyor.travelTime - conveyor.remaining + (conveyor.state === "moving" ? simulation.remainder : 0)) / conveyor.travelTime));
      const board = card.querySelector(".belt-board");
      board.style.left = `${progress * 100}%`;
      board.style.transform = `translateX(-${progress * 100}%)`;
    }
  }
  for (const buffer of simulation.buffers) {
    const card = element(`buffer-${buffer.id}`);
    const full = simulation.getStationState(buffer) === "full";
    card.dataset.full = String(full);
    card.querySelector(".equipment-state").textContent = full ? "Buffer plný" : buffer.boards.length ? "Desky čekají" : "Buffer prázdný";
    card.querySelector(".buffer-device-count").textContent = `${buffer.boards.length} / ${simulation.bufferCapacity(buffer)}`;
    card.querySelector(".buffer-next").textContent = buffer.boards.length ? `Další: ${boardName(buffer.boards[0].id)}` : "Bez čekajících desek";
    card.querySelectorAll(".buffer-rack-slot").forEach((slot, index) => {
      slot.classList.toggle("filled", index < buffer.boards.length);
      slot.title = buffer.boards[index] ? boardName(buffer.boards[index].id) : "Volná pozice";
      slot.dataset.boardId = buffer.boards[index] ? String(buffer.boards[index].id) : "";
      slot.disabled = !buffer.boards[index];
      slot.textContent = buffer.boards[index] ? boardName(buffer.boards[index].id) : "";
      slot.setAttribute("aria-label", buffer.boards[index] ? `Detail ${boardName(buffer.boards[index].id)}` : "Volná pozice");
    });
  }
}

function setBoardButtons(buttons, board) {
  buttons.forEach(button => {
    button.disabled = !board;
    button.dataset.boardId = board ? String(board.id) : "";
    button.setAttribute("aria-label", board ? `Detail ${boardName(board.id)}` : "Bez desky");
  });
}

function renderTracking() {
  let location = trackedBoardId === null ? null : simulation.locateBoard(trackedBoardId);
  if (!location) {
    const ids = simulation.stations.flatMap(station => station.kind === "buffer"
      ? station.boards.map(board => board.id) : station.board ? [station.board.id] : []);
    trackedBoardId = ids.length ? Math.min(...ids) : null;
    location = trackedBoardId === null ? null : simulation.locateBoard(trackedBoardId);
  }
  document.querySelectorAll("#machine-line > article").forEach(card => card.classList.remove("tracked"));
  document.querySelectorAll(".buffer-rack-slot").forEach(slot => {
    slot.dataset.tracked = String(trackedBoardId !== null && slot.dataset.boardId === String(trackedBoardId));
  });
  if (!location) return;
  const { station, index } = location;
  const card = element(`${station.kind}-${station.id}`);
  card.classList.add("tracked");
  const followKey = `${trackedBoardId}:${index}`;
  if (element("auto-follow").checked && !document.querySelector("dialog[open]") && lastFollowKey !== followKey) {
    const scroll = document.querySelector(".line-scroll");
    const bounds = card.getBoundingClientRect();
    const viewport = scroll.getBoundingClientRect();
    if (bounds.left < viewport.left || bounds.right > viewport.right) {
      scroll.scrollTo({ left: Math.max(0, scroll.scrollLeft + bounds.left - viewport.left - (scroll.clientWidth - bounds.width) / 2), behavior: "auto" });
    }
    lastFollowKey = followKey;
  }
}

function activityCurveSegments(points) {
  if (points.length < 2) throw new RangeError("Křivka potřebuje alespoň dva body.");
  const intervals = points.slice(1).map((point, index) => {
    const width = point.x - points[index].x;
    if (width <= 0) throw new RangeError("Body grafu musí mít rostoucí časovou osu.");
    return { width, slope: (point.y - points[index].y) / width };
  });
  const tangents = points.map((point, index) => {
    if (index === 0) return intervals[0].slope;
    if (index === points.length - 1) return intervals.at(-1).slope;
    const left = intervals[index - 1];
    const right = intervals[index];
    if (left.slope * right.slope <= 0) return 0;
    // Monotone interpolation rounds corners without overshooting peaks or zero.
    const leftWeight = 2 * right.width + left.width;
    const rightWeight = right.width + 2 * left.width;
    return (leftWeight + rightWeight) / (leftWeight / left.slope + rightWeight / right.slope);
  });
  return intervals.map((interval, index) => {
    const from = points[index];
    const to = points[index + 1];
    const offset = interval.width / 3;
    return `C ${from.x + offset} ${from.y + tangents[index] * offset} ${to.x - offset} ${to.y - tangents[index + 1] * offset} ${to.x} ${to.y}`;
  });
}

function renderActivityCharts(station, targetId) {
  const target = element(targetId);
  const history = station.activityHistory;
  const rendered = renderedChartRecords.get(targetId);
  if (rendered && rendered.station === station && rendered.record === history.at(-1)) return;
  const expandedSeries = new Set([...target.querySelectorAll("details[open]")].map(details => details.dataset.series));
  const scrollPositions = new Map([...target.querySelectorAll(".chart-causes")].map(details =>
    [details.dataset.series, details.querySelector(".table-scroll").scrollTop]));
  const focused = target.contains(document.activeElement) ? document.activeElement : null;
  const focusedSeries = focused ? focused.closest(".activity-chart-series").dataset.series : null;
  const focusedStart = focused && focused.classList.contains("chart-interval") ? focused.dataset.start : null;
  const focusedSummary = focused && focused.matches(".chart-causes > summary");
  renderedChartRecords.set(targetId, { station, record: history.at(-1) });
  if (history.length < 2) {
    target.innerHTML = '<div class="empty-state">Graf se začne kreslit po spuštění simulačního času.</div>';
    return;
  }
  const start = history[0].at;
  const end = history.at(-1).at;
  const x = at => 60 + (at - start) / (end - start) * 640;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const at = start + (end - start) * index / 4;
    return `<text x="${x(at)}" y="188" text-anchor="${index === 0 ? "start" : index === 4 ? "end" : "middle"}">${clock(at)}</text>`;
  }).join("");
  target.innerHTML = activitySeries[station.kind].map(series => {
    const { points, total } = simulation.getActivityTrend(station, series.states, series.descending);
    const maximum = points.reduce((peak, point) => Math.max(peak, point.level), 1);
    const y = value => 164 - value / maximum * 134;
    const grid = [0, maximum / 2, maximum].map(value =>
      `<line x1="60" y1="${y(value)}" x2="700" y2="${y(value)}" stroke="#283342"/><text x="52" y="${y(value) + 4}" text-anchor="end">${number(value)}</text>`
    ).join("");
    const coordinates = points.map(point => ({ x: x(point.at), y: y(point.level) }));
    const curves = activityCurveSegments(coordinates);
    const curvePath = `M ${coordinates[0].x} ${coordinates[0].y} ${curves.join(" ")}`;
    const titleId = `${targetId}-${series.id}-title`;
    const intervals = points.slice(1).map((point, index) => ({
      ...point, index: index + 1, startedAt: points[index].at
    }));
    const phases = { "1": "Nárůst odchylky", "-1": "Návrat k nule", "0": "Nula — bez odchylky" };
    const intervalText = point => `${clock(point.startedAt)}–${clock(point.at)} · ${duration(point.at - point.startedAt)} · ${phases[point.slope]} · ${statusLabels[point.state]}: ${point.reason}`;
    const selectedStart = selectedChartIntervals.get(`${targetId}:${series.id}`);
    const selected = intervals.find(point => point.startedAt === selectedStart) || intervals.at(-1);
    const overlays = intervals.map(point => {
      const from = coordinates[point.index - 1];
      const text = escapeHtml(intervalText(point));
      return `<path class="chart-interval" data-start="${point.startedAt}" data-slope="${point.slope}" d="M ${from.x} ${from.y} ${curves[point.index - 1]}" fill="none" stroke="transparent" stroke-width="12" tabindex="0" role="button" aria-label="${text}"><title>${text}</title></path>`;
    }).join("");
    const rows = intervals.slice().reverse().map(point =>
      `<tr><td>${timestamp(point.startedAt)}</td><td>${timestamp(point.at)}</td><td>${duration(point.at - point.startedAt)}</td><td><strong>${phases[point.slope]} · ${statusLabels[point.state]}</strong><span class="table-secondary resolution">${escapeHtml(point.reason)}</span></td></tr>`
    ).join("");
    const details = intervals.length ? `<details class="chart-causes" data-series="${series.id}"${expandedSeries.has(series.id) ? " open" : ""}><summary>Příčiny a intervaly (${intervals.length})</summary><div class="table-scroll"><table><caption class="sr-only">${series.label}: příčiny jednotlivých úseků</caption><thead><tr><th>Od</th><th>Do</th><th>Délka</th><th>Stav a příčina</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : "";
    return `<figure class="activity-chart-series" data-series="${series.id}" data-chart-target="${targetId}"><figcaption style="color:${series.color}">${series.label}<span>Odchylka ${duration(points.at(-1).level)} · Čas stavu ${duration(total)}</span></figcaption><svg viewBox="0 0 720 218" role="group" aria-labelledby="${titleId}" aria-describedby="${targetId}-description"><title id="${titleId}">${station.code || station.id}: ${series.label}</title><g fill="#9aa9bd" font-size="11"><text x="60" y="16">Odchylka (s), nikoli součet prostojů</text>${grid}${ticks}<text x="60" y="210">0 = bez odchylky v tomto grafu</text><text x="700" y="210" text-anchor="end">Simulační čas</text></g><path data-series="${series.id}" d="${curvePath}" fill="none" stroke="${series.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${overlays}</svg><p class="chart-interval-info">${selected ? escapeHtml(intervalText(selected)) : "Tento stav zatím nenastal."}</p>${details}</figure>`;
  }).join("");
  target.querySelectorAll(".chart-causes").forEach(details => {
    details.querySelector(".table-scroll").scrollTop = scrollPositions.get(details.dataset.series) || 0;
  });
  if (focusedStart !== null || focusedSummary) {
    const selector = focusedSummary ? ".chart-causes > summary" : `.chart-interval[data-start="${focusedStart}"]`;
    const replacement = target.querySelector(`figure[data-series="${focusedSeries}"] ${selector}`);
    if (replacement) replacement.focus({ preventScroll: true });
  }
}

function renderDetail() {
  if (selectedMachineId === null || !element("machine-detail").open) return;
  const machine = simulation.machines[selectedMachineId - 1];
  renderActivityCharts(machine, "machine-chart");
  element("detail-code").textContent = `${machineCode(machine.id)} / ${machine.technology}`;
  element("detail-title").textContent = machine.name;
  element("detail-description").textContent = machine.description;
  element("detail-state").textContent = statusLabels[machine.state];
  element("detail-state").dataset.state = machine.state;
  element("detail-current-board").textContent = machine.board ? `${boardName(machine.board.id)} · ${Math.round((1 - machine.remaining / machine.cycle) * 100)} %` : "Ve stroji není deska";
  setBoardButtons([element("detail-current-board")], machine.board);
  element("detail-cycle").innerHTML = `${number(machine.cycle)} <small>s / deska</small>`;
  const windowSeconds = Math.min(simulation.time, 60);
  const output = machine.departures.filter(departure => departure.at > simulation.time - 60).length;
  const rate = windowSeconds > 0 ? output / windowSeconds * 60 : 0;
  element("detail-rate").innerHTML = `${number(rate)} <small>ks / min</small>`;
  element("detail-rate-note").textContent = `Za posledních ${number(windowSeconds)} s simulace · včetně prostojů`;
  element("detail-processed").innerHTML = `${machine.processed} <small>ks</small>`;
  element("detail-occupancy").textContent = `Obsazení ${machine.board ? 1 : 0} / ${machine.capacity} · stroj nemá zásobník`;
  const recent = machine.departures.slice(-20);
  const average = recent.length ? recent.reduce((sum, departure) => sum + departure.at - departure.startedAt, 0) / recent.length : null;
  element("detail-board-time").innerHTML = average === null ? "—" : `${number(average)} <small>s / deska</small>`;
  const incidents = simulation.incidents.filter(incident => incident.machineId === machine.id);
  element("detail-technician-note").textContent = `Posledních 50 poruch tohoto stroje. Technici SMT: ${simulation.settings.technologies.SMT.technicianCount}, THT: ${simulation.settings.technologies.THT.technicianCount}.`;
  element("detail-fault-count").textContent = `${incidents.length} poruch · ${incidents.filter(incident => incident.status === "resolved").length} vyřešeno`;
  const active = incidents.find(incident => incident.status !== "resolved");
  element("trigger-fault").disabled = Boolean(active);
  element("trigger-fault").textContent = active ? "Probíhá zásah" : "⚡ Vyvolat testovací poruchu";
  element("detail-active").hidden = !active;
  if (active) {
    const technician = simulation.technicians.find(item => item.id === active.technicianId);
    let eta = "Čeká na volného technika příslušné technologie.";
    if (active.status === "dispatched") eta = `Příchod za ${duration(Math.max(0, active.arrivalDue - simulation.time))}.`;
    if (active.status === "repairing") eta = `Oprava: zbývá ${duration(Math.max(0, active.repairDue - simulation.time))}.`;
    if (active.status === "restarting") eta = `Rozjezd: zbývá ${duration(Math.max(0, active.restartDue - simulation.time))}.`;
    element("detail-active").textContent = `${incidentLabels[active.status]} · ${technician ? technician.name : machine.technology} · ${eta}${simulation.running ? "" : " Simulace je pozastavená."}`;
  }
  element("detail-incidents").innerHTML = incidents.length ? incidents.slice(-50).reverse().map(incident => {
    const technician = simulation.technicians.find(item => item.id === incident.technicianId);
    const reaction = (incident.arrivedAt === null ? simulation.time : incident.arrivedAt) - incident.startedAt;
    return `<tr>
      <td><strong>${incident.cause}</strong><span class="incident-status ${incident.status}">${incidentLabels[incident.status]}</span><span class="table-secondary resolution">${incident.repairedAt === null ? "Plán zásahu" : "Provedeno"}: ${incident.resolution}</span></td>
      <td>${timestamp(incident.startedAt)}<span class="table-secondary">${incident.source === "auto" ? "Automatická" : "Ruční"} porucha</span></td>
      <td>${timestamp(incident.arrivedAt)}<span class="table-secondary">${technician ? technician.name : "Čeká na technika"}</span><strong class="${incident.arrivedAt === null ? "pending-time" : ""}">Reakce: ${duration(reaction)}</strong>${incident.arrivedAt === null ? '<span class="table-secondary">Čas zatím běží</span>' : ""}</td>
      <td>${timestamp(incident.repairedAt)}</td><td>${timestamp(incident.restartedAt)}</td>
      <td><strong class="${incident.restartedAt === null ? "pending-time" : ""}">${duration((incident.restartedAt === null ? simulation.time : incident.restartedAt) - incident.startedAt)}</strong>${incident.restartedAt === null ? '<span class="table-secondary">Stále odstaveno</span>' : ""}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="6"><div class="empty-state"><strong>Tento stroj zatím neměl poruchu.</strong><p>Poruchu můžete vyvolat tlačítkem výše nebo počkat na automatický scénář.</p></div></td></tr>';
  element("detail-boards").innerHTML = recent.length ? recent.reverse().map(departure =>
    `<tr><td><button type="button" class="pcb-button board-link" data-board-id="${departure.boardId}">${boardName(departure.boardId)}</button></td><td>${timestamp(departure.startedAt)}</td><td>${timestamp(departure.at)}</td><td>${duration(departure.at - departure.startedAt)}</td></tr>`
  ).join("") : '<tr><td colspan="4"><div class="empty-state">Strojem zatím neprošla žádná deska.</div></td></tr>';
  element("detail-toggle-running").textContent = simulation.running ? "Ⅱ Pozastavit" : "▶ Pokračovat";
}

function renderConveyorDetail() {
  if (selectedConveyorId === null || !element("conveyor-detail").open) return;
  const conveyor = simulation.conveyors.find(item => item.id === selectedConveyorId);
  const next = simulation.stations[simulation.stations.indexOf(conveyor) + 1];
  element("conveyor-code").textContent = `${conveyor.id} / ${conveyor.technology}`;
  element("conveyor-title").textContent = `Dopravník ${conveyor.id}`;
  element("conveyor-description").textContent = `${number(conveyor.length)} m · ${number(conveyor.speed)} m/min · navazuje na ${next.code || next.id}${next.name ? ` · ${next.name}` : ` · ${next.kind === "buffer" ? "Buffer" : "Dopravník"}`}`;
  element("conveyor-state").textContent = statusLabels[conveyor.state];
  element("conveyor-state").dataset.state = conveyor.state;
  element("conveyor-current-board").textContent = conveyor.board ? boardName(conveyor.board.id) : "Bez desky";
  setBoardButtons([element("conveyor-current-board")], conveyor.board);
  element("conveyor-capacity").textContent = `${conveyor.board ? 1 : 0} / ${conveyor.capacity}`;
  element("conveyor-remaining").textContent = conveyor.board ? duration(conveyor.remaining) : "—";
  element("conveyor-travel-note").textContent = conveyor.state === "stopped" ? "Pás je zastavený; deska se nepohybuje."
    : conveyor.state === "blocked" ? "Průjezd hotov; čeká na uvolnění výstupu." : `Samotný průjezd trvá ${duration(conveyor.travelTime)}.`;
  element("conveyor-blocked-total").textContent = duration(conveyor.blockedTotal);
  element("conveyor-blocked-count").textContent = `${conveyor.blockedCount} prostojů od spuštění`;
  element("conveyor-processed").textContent = conveyor.processed;
  const reason = simulation.getBlockingReason(conveyor);
  element("conveyor-block-reason").hidden = reason === null;
  if (reason !== null) {
    element("conveyor-block-reason").textContent = `${reason} Čeká již ${duration(simulation.time - conveyor.blockedSince)}.${simulation.running ? "" : " Simulace je pozastavená."}`;
  }
  renderActivityCharts(conveyor, "conveyor-chart");
  const blocks = conveyor.stateHistory.map((entry, index) => ({
    ...entry, endedAt: index + 1 < conveyor.stateHistory.length ? conveyor.stateHistory[index + 1].at : null
  })).filter(entry => entry.state === "blocked" || entry.state === "stopped").slice(-20).reverse();
  element("conveyor-history").innerHTML = blocks.length ? blocks.map(entry =>
    `<tr><td>${entry.boardId === null ? "Bez desky" : `<button type="button" class="pcb-button board-link" data-board-id="${entry.boardId}">${boardName(entry.boardId)}</button>`}<span class="table-secondary resolution">${entry.reason}</span></td><td>${timestamp(entry.at)}</td><td>${timestamp(entry.endedAt)}${entry.endedAt === null ? '<span class="table-secondary">Stále blokováno</span>' : ""}</td><td><strong class="${entry.endedAt === null ? "pending-time" : ""}">${duration((entry.endedAt === null ? simulation.time : entry.endedAt) - entry.at)}</strong></td></tr>`
  ).join("") : '<tr><td colspan="4"><div class="empty-state">Dopravník zatím neměl zaznamenanou blokaci.</div></td></tr>';
  element("conveyor-toggle-running").textContent = simulation.running ? "Ⅱ Pozastavit" : "▶ Pokračovat";
}

function renderBufferDetail() {
  if (selectedBufferId === null || !element("buffer-detail").open) return;
  const buffer = simulation.buffers.find(item => item.id === selectedBufferId);
  const state = simulation.getStationState(buffer);
  element("buffer-code").textContent = `${buffer.id} / ${buffer.technology}`;
  element("buffer-title").textContent = `Buffer ${buffer.id}`;
  element("buffer-state").textContent = statusLabels[state];
  element("buffer-state").dataset.state = state;
  element("buffer-capacity").textContent = `${buffer.boards.length} / ${simulation.bufferCapacity(buffer)}`;
  element("buffer-free").textContent = simulation.bufferCapacity(buffer) - buffer.boards.length;
  element("buffer-processed").textContent = buffer.processed;
  const next = buffer.boards[0];
  element("buffer-wait").textContent = next ? duration(next.visits.at(-1).bufferWait) : "—";
  element("buffer-current-board").textContent = next ? `Další: ${boardName(next.id)}` : "Bez čekajících desek";
  setBoardButtons([element("buffer-current-board")], next);
  renderActivityCharts(buffer, "buffer-chart");
  element("buffer-toggle-running").textContent = simulation.running ? "Ⅱ Pozastavit" : "▶ Pokračovat";
}

function renderBoardDetail() {
  if (selectedBoardId === null || !element("board-detail").open) return;
  const board = simulation.getBoard(selectedBoardId);
  const location = simulation.locateBoard(board.id);
  const end = board.completedAt !== null ? board.completedAt : board.removedAt !== undefined ? board.removedAt : simulation.time;
  const age = end - board.enteredAt;
  const categories = [
    { key: "processing", label: "Zpracování", color: "#7daaff" },
    { key: "transport", label: "Přeprava", color: "#4af0ba" },
    { key: "bufferWait", label: "Buffer", color: "#bc96ef" },
    { key: "blocked", label: "Blokace", color: "#ffc66c" },
    { key: "fault", label: "Porucha", color: "#ff7587" }
  ].map(category => ({ ...category, seconds: board.visits.reduce((sum, visit) => sum + visit[category.key], 0) }));
  const totals = Object.fromEntries(categories.map(category => [category.key, category.seconds]));
  element("board-title").textContent = boardName(board.id);
  element("board-location").textContent = location
    ? `${location.station.code || location.station.id} · ${location.station.name || (location.station.kind === "buffer" ? "Buffer" : "Dopravník")} · ${location.station.kind === "buffer" ? "Čeká v bufferu" : statusLabels[location.station.state]}`
    : board.removedAt !== undefined ? "Odebrána s vyměněným magazínem" : "Hotová deska opustila linku";
  element("board-timestamps").innerHTML = `Vstup: ${timestamp(board.enteredAt)} · Výstup: ${board.completedAt !== null ? timestamp(board.completedAt) : board.removedAt !== undefined ? `odebrána ${timestamp(board.removedAt)}` : "Ještě v lince"}${simulation.running ? "" : " · Pozastaveno"}`;
  element("board-age").textContent = duration(age);
  element("board-delay").textContent = duration(totals.bufferWait + totals.blocked + totals.fault);
  element("board-work").textContent = duration(totals.processing + totals.transport);
  element("board-stations").textContent = `${board.visits.filter(visit => visit.exitedAt !== null).length} / ${simulation.stations.length}`;
  element("board-status").textContent = board.completedAt === null ? "Deska je stále v procesu" : "Dokončeno — konečné časy";
  element("board-time-chart").innerHTML = `<div class="board-time-bar" role="img" aria-label="Rozdělení ${duration(age)} v lince">${categories.map(category => `<span data-category="${category.key}" style="width:${age > 0 ? category.seconds / age * 100 : 0}%;background:${category.color}" title="${category.label}: ${duration(category.seconds)}"></span>`).join("")}</div><div class="chart-legend">${categories.map(category => `<span><i class="legend-dot" style="background:${category.color}"></i>${category.label}: ${duration(category.seconds)}</span>`).join("")}</div>`;
  element("board-visits").innerHTML = board.visits.map(visit => `<tr><td><strong>${visit.code}</strong><span class="table-secondary">${visit.name}</span></td><td>${timestamp(visit.enteredAt)}</td><td>${timestamp(visit.exitedAt)}</td><td>${duration((visit.exitedAt === null ? end : visit.exitedAt) - visit.enteredAt)}</td><td>${duration(visit.processing + visit.transport)}</td><td>${duration(visit.bufferWait)}</td><td>${duration(visit.blocked)}</td><td>${duration(visit.fault)}</td></tr>`).join("");
  const delays = board.visits.flatMap(visit => visit.delays.map(delay => ({ ...delay, code: visit.code })));
  element("board-delays").innerHTML = delays.length ? delays.map(delay => `<tr><td><strong>${delay.code} · ${categories.find(category => category.key === delay.category).label}</strong><span class="table-secondary resolution">${delay.reason}</span></td><td>${timestamp(delay.startedAt)}</td><td>${timestamp(delay.endedAt)}</td><td>${duration(delay.endedAt - delay.startedAt)}</td></tr>`).join("") : '<tr><td colspan="4"><div class="empty-state">Deska zatím neměla žádné zdržení.</div></td></tr>';
  element("board-toggle-running").textContent = simulation.running ? "Ⅱ Pozastavit" : "▶ Pokračovat";
}

function openBoardDetail(boardId) {
  simulation.getBoard(boardId);
  element("machine-detail").close();
  element("conveyor-detail").close();
  element("buffer-detail").close();
  selectedBoardId = boardId;
  trackedBoardId = boardId;
  lastFollowKey = null;
  if (!element("board-detail").open) element("board-detail").showModal();
  render();
}

function render() {
  const date = new Date(simulation.baseTime + simulation.time * 1000);
  element("clock").textContent = timeFormatter.format(date);
  element("clock").title = dateFormatter.format(date);
  const total = Math.floor(simulation.time);
  element("elapsed").textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)} od spuštění`;
  element("input-count").textContent = `${simulation.generated} ks`;
  element("output-count").textContent = `${simulation.completed} ks`;
  element("line-summary").textContent = `${simulation.machines.length} STROJŮ · ${simulation.conveyors.length} DOPRAVNÍKŮ · ${simulation.buffers.length} BUFFERY · V LINCE ${simulation.inFlight} DESEK`;
  element("toggle-running").textContent = simulation.running ? "Ⅱ Pozastavit" : "▶ Pokračovat";
  element("toggle-running").setAttribute("aria-pressed", String(!simulation.running));
  element("live-status").innerHTML = `<span class="status-dot"></span> ${simulation.running ? "Simulace běží" : "Pozastaveno"}`;
  document.body.classList.toggle("paused", !simulation.running);
  renderMachines();
  renderTracking();
  renderDetail();
  renderConveyorDetail();
  renderBufferDetail();
  renderBoardDetail();
  if (isTestLine) document.dispatchEvent(new Event("line-rendered"));
}

function openDetail(machineId) {
  selectedMachineId = machineId;
  element("machine-detail").showModal();
  renderDetail();
  if (isTestLine) document.dispatchEvent(new CustomEvent("line-detail-opened", { detail: { kind: "machine", id: machineId } }));
}

function openConveyorDetail(conveyorId) {
  selectedConveyorId = conveyorId;
  element("conveyor-detail").showModal();
  renderConveyorDetail();
  if (isTestLine) document.dispatchEvent(new CustomEvent("line-detail-opened", { detail: { kind: "conveyor", id: conveyorId } }));
}

function openBufferDetail(bufferId) {
  selectedBufferId = bufferId;
  element("buffer-detail").showModal();
  renderBufferDetail();
  if (isTestLine) document.dispatchEvent(new CustomEvent("line-detail-opened", { detail: { kind: "buffer", id: bufferId } }));
}

function toggleRunning() {
  simulation.running = !simulation.running;
  lastFrame = null;
  render();
}

element("toggle-running").addEventListener("click", toggleRunning);
element("detail-toggle-running").addEventListener("click", toggleRunning);
element("conveyor-toggle-running").addEventListener("click", toggleRunning);
element("buffer-toggle-running").addEventListener("click", toggleRunning);
element("board-toggle-running").addEventListener("click", toggleRunning);
function showChartInterval(event) {
  const interval = event.target.closest(".chart-interval");
  if (!interval) return;
  const figure = interval.closest(".activity-chart-series");
  selectedChartIntervals.set(`${figure.dataset.chartTarget}:${figure.dataset.series}`, Number(interval.dataset.start));
  figure.querySelector(".chart-interval-info").textContent = interval.getAttribute("aria-label");
}
document.addEventListener("pointerover", showChartInterval);
document.addEventListener("focusin", showChartInterval);
document.addEventListener("click", showChartInterval);
document.addEventListener("keydown", event => {
  if (event.target.closest(".chart-interval") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    showChartInterval(event);
  }
});
element("speed").addEventListener("change", event => {
  speed = Number(event.target.value);
  lastFrame = null;
  notify(`Rychlost simulace nastavena na ${number(speed)}×.`);
});
element("auto-faults").addEventListener("change", event => {
  simulation.autoFaults = event.target.checked;
  simulation.nextFaultAt = simulation.time + simulation.settings.faults.firstAfter;
  notify(simulation.autoFaults ? "Automatické poruchy zapnuty." : "Automatické poruchy vypnuty. Existující zásahy pokračují.");
});
element("single-board").addEventListener("change", event => {
  simulation.singleBoard = event.target.checked;
  notify(simulation.singleBoard
    ? "Ukázka jedné desky zapnuta. Existující desky dojedou; nová vstoupí až po vyprázdnění linky."
    : "Plná linka zapnuta. Desky budou vstupovat průběžně, sledovaná deska zůstává zvýrazněná.");
  render();
});
element("auto-follow").addEventListener("change", event => {
  lastFollowKey = null;
  notify(event.target.checked ? "Pohled automaticky sleduje desku." : "Automatické posouvání vypnuto. Linku můžete prohlížet ručně.");
  renderTracking();
});
element("trigger-fault").addEventListener("click", () => {
  if (selectedMachineId === null) {
    notify("Nejprve otevřete detail stroje.");
    return;
  }
  const machine = simulation.machines[selectedMachineId - 1];
  if (machine.incidentId !== null) {
    notify("Tento stroj již má aktivní poruchu.");
    return;
  }
  simulation.triggerFault(machine.id);
  notify(`Testovací porucha na ${machineCode(machine.id)} byla vyvolána.${simulation.running ? "" : " Pokračujte v simulaci pro zahájení zásahu."}`);
  render();
});
element("machine-line").addEventListener("click", event => {
  if (event.target.closest("[data-board-id]")) return;
  const card = event.target.closest("[data-detail-kind]");
  if (!card) return;
  if (card.dataset.detailKind === "machine") openDetail(Number(card.dataset.detailId));
  else if (card.dataset.detailKind === "conveyor") openConveyorDetail(card.dataset.detailId);
  else openBufferDetail(card.dataset.detailId);
});
element("machine-line").addEventListener("keydown", event => {
  if (event.target.closest("button")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-detail-kind]");
  if (!card) return;
  event.preventDefault();
  if (card.dataset.detailKind === "machine") openDetail(Number(card.dataset.detailId));
  else if (card.dataset.detailKind === "conveyor") openConveyorDetail(card.dataset.detailId);
  else openBufferDetail(card.dataset.detailId);
});
document.addEventListener("click", event => {
  const button = event.target.closest("[data-board-id]");
  if (button && !button.disabled && button.dataset.boardId) openBoardDetail(Number(button.dataset.boardId));
});
element("close-board").addEventListener("click", () => element("board-detail").close());
element("board-detail").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    element("board-detail").close();
  }
});
element("board-detail").addEventListener("close", () => {
  if (!element("board-detail").open) selectedBoardId = null;
  lastFollowKey = null;
  renderTracking();
});
element("close-detail").addEventListener("click", () => element("machine-detail").close());
element("machine-detail").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    element("machine-detail").close();
  }
});
element("machine-detail").addEventListener("close", () => {
  if (!element("machine-detail").open) selectedMachineId = null;
  lastFollowKey = null;
  renderTracking();
});
element("close-conveyor").addEventListener("click", () => element("conveyor-detail").close());
element("conveyor-detail").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    element("conveyor-detail").close();
    element("board-detail").close();
  }
});
element("conveyor-detail").addEventListener("close", () => {
  if (!element("conveyor-detail").open) selectedConveyorId = null;
  lastFollowKey = null;
  renderTracking();
});
element("close-buffer").addEventListener("click", () => element("buffer-detail").close());
element("buffer-detail").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    element("buffer-detail").close();
  }
});
element("buffer-detail").addEventListener("close", () => {
  if (!element("buffer-detail").open) selectedBufferId = null;
  lastFollowKey = null;
  renderTracking();
});
function restartDemo() {
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  selectedMachineId = null;
  selectedConveyorId = null;
  selectedBufferId = null;
  selectedChartIntervals.clear();
  renderedChartRecords.clear();
  selectedBoardId = null;
  trackedBoardId = null;
  lastFollowKey = null;
  simulation = createDemo();
  lastFrame = null;
  buildMachines();
  render();
}
element("reset").addEventListener("click", () => {
  restartDemo();
  notify(isTestLine ? "Testovací linka vyprázdněna. Použité nastavení zůstává stejné."
    : simulation.singleBoard
    ? "Nová ukázka jedné desky spuštěna od prázdné linky."
    : "Nová plná linka připravena po 3 simulačních minutách. Předchozí průběh a poruchy byly vymazány.");
});
document.addEventListener("visibilitychange", () => { lastFrame = null; });
globalThis.addEventListener("resize", () => {
  lastFollowKey = null;
  renderTracking();
});

function frame(now) {
  if (lastFrame !== null && !document.hidden) simulation.advance(Math.min((now - lastFrame) / 1000, 0.5) * speed);
  lastFrame = now;
  if (now - lastRender >= 100) {
    render();
    lastRender = now;
  }
  requestAnimationFrame(frame);
}

buildMachines();
render();
requestAnimationFrame(frame);
