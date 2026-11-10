"use strict";

let testSettingsDirty = false;
const settingValue = path => path.split(".").reduce((value, key) => value[key], testSettings);
const settingNumber = value => value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

function settingField(path, label, min, max, step = 1, help = "") {
  const id = `setting-${path.replaceAll(".", "-")}`;
  return `<label class="setting-field" for="${id}"><span>${label}</span><input id="${id}" data-setting="${path}" type="number" min="${min}" max="${max}" step="${step}" value="${settingValue(path)}" required>${help ? `<small>${help}</small>` : ""}</label>`;
}

function settingSelect(path, label, options, help = "") {
  const id = `setting-${path.replaceAll(".", "-")}`;
  return `<label class="setting-field" for="${id}"><span>${label}</span><select id="${id}" data-setting="${path}">${options.map((option, index) =>
    `<option value="${index}"${settingValue(path) === index ? " selected" : ""}>${option}</option>`).join("")}</select>${help ? `<small>${help}</small>` : ""}</label>`;
}

function settingSwitch(path, label) {
  return `<label class="setting-check"><input type="checkbox" data-setting="${path}" data-numeric-boolean${settingValue(path) ? " checked" : ""}> ${label}</label>`;
}

function technologySettings(technology) {
  const machines = simulation.machines.filter(station => station.technology === technology);
  const conveyors = simulation.conveyors.filter(station => station.technology === technology);
  const buffers = simulation.buffers.filter(station => station.technology === technology);
  const prefix = `technologies.${technology}`;
  return `<details class="test-config-group"><summary><strong>${technology}</strong><span>${machines.length} strojů · ${conveyors.length} dopravníků · ${buffers.length} buffery</span></summary>
    <div class="test-config-content">
      <fieldset><legend>Společná nastavení technologie ${technology}</legend><div class="setting-grid">
        ${settingField(`${prefix}.speedFactor`, "Tempo strojů (násobek)", 0.25, 4, 0.25, "2× = dvojnásobné tempo; pásy mají vlastní rychlost.")}
        ${settingField(`${prefix}.technicianCount`, "Počet techniků", 0, 5, 1, "0 = porucha bude čekat bez opravy.")}
        ${settingField(`${prefix}.arrivalMin`, "Příchod technika: minimum (s)", 1, 3600)}
        ${settingField(`${prefix}.arrivalMax`, "Příchod technika: maximum (s)", 1, 3600)}
        ${settingField(`${prefix}.repairMin`, "Oprava: minimum (s)", 1, 3600)}
        ${settingField(`${prefix}.repairMax`, "Oprava: maximum (s)", 1, 3600)}
        ${settingField(`${prefix}.restart`, "Rozjezd po opravě (s)", 1, 3600)}
      </div>${settingSwitch(`${prefix}.faultsEnabled`, `Povolit automatické poruchy strojů ${technology}`)}</fieldset>
      <h3>Jednotlivé stroje</h3><div class="device-settings-grid">${machines.map(machine =>
        `<fieldset><legend>${machine.code} · ${machine.name}</legend>
          ${settingField(`machines.${machine.code}.cycle`, "Základní cyklus (s / deska)", 0.25, 3600, 0.25)}
          ${settingField(`machines.${machine.code}.faultWeight`, "Váha automatické poruchy", 0, 10, 1, "0 = bez automatických poruch; vyšší váha = častější výběr.")}
          ${settingField(`machines.${machine.code}.loadDelay`, "Zavedení desky (s)", 0, 3600, 0.25, "Čas navíc před zahájením zpracování.")}
          ${settingField(`machines.${machine.code}.unloadDelay`, "Vyvedení desky (s)", 0, 3600, 0.25, "Čas navíc po zpracování před předáním dál.")}
          ${settingField(`machines.${machine.code}.repairFactor`, "Násobek doby opravy", 0.25, 4, 0.25, "2× = opravy tohoto stroje trvají dvojnásobně.")}
          ${settingField(`machines.${machine.code}.microStopChance`, "Mikrozastavení: šance na desku (%)", 0, 100, 1, "Krátké zaseknutí, které se řeší bez technika (např. chyba odběru součástky).")}
          ${settingField(`machines.${machine.code}.microStopDuration`, "Mikrozastavení: délka (s)", 0, 3600, 0.25, "O kolik se při mikrozastavení prodlouží zpracování desky.")}
          <output id="preview-${machine.code}" class="setting-preview"></output>
        </fieldset>`).join("")}</div>
      <h3>Dopravníky</h3><p class="settings-help">Doba průjezdu = délka pásu / rychlost. Pás lze při testu zastavit a znovu uvolnit, bez ztráty desky.</p>
      <div class="device-settings-grid">${conveyors.map(conveyor =>
        `<fieldset><legend>${conveyor.id} · dopravník</legend>
          ${settingField(`conveyors.${conveyor.id}.length`, "Délka pásu (m)", 0.01, 100, 0.01)}
          ${settingField(`conveyors.${conveyor.id}.speed`, "Rychlost pásu (m/min)", 0.1, 1000, 0.1)}
          ${settingField(`conveyors.${conveyor.id}.wait`, "Čekání na konci pásu (s)", 0, 3600, 0.25, "Deska po dojetí počká, než se pokusí o předání dál (např. chladnutí).")}
          ${settingSwitch(`conveyors.${conveyor.id}.stopped`, "Začít se zastaveným pásem")}
          <output id="preview-${conveyor.id}" class="setting-preview"></output>
        </fieldset>`).join("")}</div>
      <h3>Buffery</h3><div class="device-settings-grid">${buffers.map(buffer =>
        `<fieldset><legend>${buffer.id} · buffer</legend>${settingField(`buffers.${buffer.id}.capacity`, "Kapacita (desky)", 1, 20)}
          ${settingSelect(`buffers.${buffer.id}.mode`, "Režim", LineSimulation.bufferModes().map(mode => mode.name), LineSimulation.bufferModes().map(mode => `${mode.name}: ${mode.description}`).join(" "))}
          ${settingField(`buffers.${buffer.id}.holdTime`, "Minimální zdržení v bufferu (s)", 0, 3600, 0.25, "Deska musí v bufferu strávit alespoň tuto dobu.")}
          ${settingField(`buffers.${buffer.id}.swapMin`, "Výměna plného magazínu: nejdřív za (s)", 0, 3600, 1, "Technik vymění plný zaseknutý magazín; po výměně je buffer prázdný a plní se znovu. Maximum 0 = nikdy.")}
          ${settingField(`buffers.${buffer.id}.swapMax`, "Výměna plného magazínu: nejpozději za (s)", 0, 3600, 1)}</fieldset>`).join("")}</div>
    </div>
  </details>`;
}

element("line-title").textContent = "Testovací linka";
element("line-intro").textContent = "Klikněte na zařízení pro jeho nastavení nebo na pruh SMT / THT pro nastavení celé technologie. Pak pošlete jednu desku nebo spusťte souvislý provoz.";
element("single-board").closest("label").hidden = true;
element("auto-follow").checked = true;
element("reset").textContent = "↺ Vyprázdnit test";
document.querySelector(".demo-caption").textContent = "Testovací linka je oddělená od výrobní. Začíná prázdná, desky se nezakládají automaticky. Můžete poslat jednu desku (po dokončení se simulace zastaví) nebo spustit souvislý provoz s více deskami najednou a sledovat buffery, blokace a poruchy. Změny nastavení se projeví až tlačítkem Použít a vyprázdnit test. Časy jsou zaokrouhlené nahoru na krok simulace 0,25 s. Kapacita stroje a dopravníku je 1 deska.";
element("test-settings").hidden = false;
element("test-settings").innerHTML = `
  <div class="panel-heading"><div><div class="eyebrow">SAMOSTATNÁ LABORATOŘ · SMT + THT</div><h2>Nastavení testovací linky</h2></div><span class="count-badge">1 deska nebo souvislý provoz</span></div>
  <p class="settings-help">Zařízení lze nastavit přímo kliknutím v lince; pruh SMT / THT otevře společná nastavení technologie. Níže je také celý formulář pro hromadnou úpravu. Nastavení se do výrobní linky nepřenáší.</p>
  <form id="test-settings-form">
    ${technologySettings("SMT")}${technologySettings("THT")}
    <details class="test-config-group"><summary><strong>Automatické poruchy</strong><span>Intervaly pro celou linku</span></summary><div class="test-config-content setting-grid">
      ${settingField("faults.firstAfter", "První porucha po (s)", 1, 3600)}
      ${settingField("faults.intervalMin", "Další porucha: minimum (s)", 1, 3600)}
      ${settingField("faults.intervalMax", "Další porucha: maximum (s)", 1, 3600)}
    </div><p class="settings-help">Generování zapnete přepínačem Automatické poruchy pod linkou. Váhy strojů určují, který stroj se vybere. Ručně lze poruchu vyvolat i při vypnutém generování.</p></details>
    <div class="test-form-actions"><button class="button" type="submit">Použít nastavení a vyprázdnit test</button><button class="button" id="test-defaults" type="button">Vrátit výchozí hodnoty</button><button class="button" id="test-realistic" type="button">Načíst realistický profil</button><span id="test-settings-feedback" role="status">Výchozí nastavení je připravené.</span></div>
    <p class="settings-help">Použití nastavení smaže aktuální desku, výsledky i grafy. Žádné parametry se nemění uprostřed běžícího testu.</p>
  </form>
  <div class="test-run-actions"><button class="button primary" id="test-send-board" type="button">→ Poslat jednu desku</button><button class="button primary" id="test-start-continuous" type="button">▶ Spustit souvislý provoz</button><button class="pcb-button board-link" id="test-current-board" type="button" disabled>Žádná deska</button><span id="test-expected"></span></div>
  <div class="test-run-progress"><progress id="test-progress" value="0" max="${simulation.stations.length}" aria-label="Průchod testovací desky"></progress><p id="test-run-status" role="status"></p></div>
  <div class="test-interventions">
    <div><label for="test-fault-machine">Test chyby stroje</label><select id="test-fault-machine">${simulation.machines.map(machine => `<option value="${machine.id}">${machine.code} · ${machine.name}</option>`).join("")}</select><button class="button danger" id="test-trigger-fault" type="button">Vyvolat poruchu</button></div>
    <div><label for="test-stop-conveyor">Test zastavení pásu</label><select id="test-stop-conveyor">${simulation.conveyors.map(conveyor => `<option value="${conveyor.id}">${conveyor.id} · ${conveyor.technology}</option>`).join("")}</select><button class="button" id="test-toggle-belt" type="button">Zastavit pás</button></div>
    <div><label for="test-swap-buffer">Test výměny magazínu</label><select id="test-swap-buffer">${simulation.buffers.map(buffer => `<option value="${buffer.id}">${buffer.id} · ${buffer.technology}</option>`).join("")}</select><button class="button" id="test-swap-magazine" type="button">Vyměnit magazín</button></div>
  </div>
  <div class="test-report-actions">
    <label class="setting-field" for="test-duration"><span>Délka souvislého testu (min simulovaného času, 0 = bez limitu)</span><input id="test-duration" type="number" min="0" max="1440" step="1" value="30"><small>Po dosažení limitu se simulace zastaví a zobrazí se vyhodnocení.</small></label>
    <button class="button primary" id="test-report-show" type="button">📊 Vyhodnotit test</button>
    <button class="button" id="test-report-download" type="button" disabled>⬇ Stáhnout protokol</button>
  </div>
  <div id="test-report" class="test-report" hidden></div>`;

function readTestSettings() {
  const settings = LineSimulation.defaultSettings();
  element("test-settings-form").querySelectorAll("[data-setting]").forEach(input => {
    const path = input.dataset.setting.split(".");
    const key = path.pop();
    const target = path.reduce((value, part) => value[part], settings);
    target[key] = input.hasAttribute("data-numeric-boolean") ? Number(input.checked) : Number(input.value);
  });
  return settings;
}

function updateSettingPreviews() {
  const draft = readTestSettings();
  for (const machine of simulation.machines) {
    const config = draft.machines[machine.code];
    const factor = draft.technologies[machine.technology].speedFactor;
    element(`preview-${machine.code}`).textContent = config.cycle > 0 && factor > 0
      ? `Cyklus po započtení tempa: ${settingNumber(Math.ceil(config.cycle / factor / 0.25 - 1e-9) * 0.25)} s; obsazení stroje včetně zavedení a vyvedení: ${settingNumber(Math.ceil(config.cycle / factor / 0.25 - 1e-9) * 0.25 + config.loadDelay + config.unloadDelay)} s.`
      : "Doplňte platný cyklus a tempo technologie.";
  }
  for (const conveyor of simulation.conveyors) {
    const config = draft.conveyors[conveyor.id];
    const valid = config.length >= 0.01 && config.length <= 100 && config.speed >= 0.1 && config.speed <= 1000;
    element(`preview-${conveyor.id}`).textContent = valid
      ? `Průjezd: ${settingNumber(60 * config.length / config.speed)} s; v simulaci ${settingNumber(LineSimulation.conveyorTravelTime(config.length, config.speed))} s + čekání ${settingNumber(config.wait)} s.`
      : "Doplňte platnou délku a rychlost pásu.";
  }
}

function fillTestForm(settings) {
  element("test-settings-form").querySelectorAll("[data-setting]").forEach(input => {
    const value = input.dataset.setting.split(".").reduce((target, key) => target[key], settings);
    if (input.hasAttribute("data-numeric-boolean")) input.checked = Boolean(value);
    else input.value = value;
  });
  testSettingsDirty = true;
  updateSettingPreviews();
  renderTestStatus();
}

function renderTestStatus() {
  const first = simulation.machines[0];
  const continuous = !simulation.manualFeed;
  const canSend = !testSettingsDirty && !continuous && simulation.inFlight === 0 && simulation.canLoadMachine(first);
  element("test-send-board").disabled = !canSend;
  element("test-send-board").title = testSettingsDirty ? "Nejprve použijte změněné nastavení."
    : continuous ? "Běží souvislý provoz; vyprázdněním testu se vrátíte k jedné desce."
    : simulation.inFlight > 0 ? "Počkejte na dokončení předchozí desky."
    : !simulation.canLoadMachine(first) ? "Vstupní stroj má poruchu; spusťte opravu tlačítkem Pokračovat." : "Odešle jednu desku a spustí simulaci.";
  element("test-start-continuous").disabled = testSettingsDirty || continuous;
  element("test-start-continuous").title = testSettingsDirty ? "Nejprve použijte změněné nastavení." : "Začne průběžně zakládat desky podle volné kapacity.";
  const minimum = simulation.machines.reduce((sum, machine) => sum + machine.cycle + machine.loadDelay + machine.unloadDelay, 0)
    + simulation.conveyors.reduce((sum, conveyor) => sum + conveyor.travelTime + conveyor.wait, 0)
    + simulation.buffers.reduce((sum, buffer) => sum + Math.max(0.25, buffer.holdTime), 0);
  const bottleneck = simulation.machines.reduce((max, machine) =>
    Math.max(max, machine.cycle + machine.loadDelay + machine.unloadDelay), 0);
  element("test-expected").textContent = `Průchod bez prostojů: ${settingNumber(minimum)} s · nejpomalejší stroj: ${settingNumber(bottleneck)} s / deska (max. ${settingNumber(3600 / bottleneck)} desek/h)`;
  const board = simulation.generated ? simulation.getBoard(simulation.generated) : null;
  setBoardButtons([element("test-current-board")], board);
  element("test-current-board").textContent = board ? `Detail ${boardName(board.id)} ↗` : "Žádná deska";
  element("test-progress").value = board ? board.visits.filter(visit => visit.exitedAt !== null).length : 0;
  const location = board && board.removedAt === undefined ? simulation.locateBoard(board.id) : null;
  const bufferSummary = simulation.buffers.map(buffer => `${buffer.id} ${buffer.boards.length}/${simulation.bufferCapacity(buffer)}`).join(" · ");
  const status = continuous
    ? `Souvislý provoz · čas ${settingNumber(simulation.time)} s · založeno ${simulation.generated} · hotovo ${simulation.completed} · v lince ${simulation.inFlight} · ${(simulation.completed / Math.max(simulation.time, 1) * 3600).toFixed(0)} desek/h · aktivní poruchy ${simulation.activeIncidents.length} · ${bufferSummary}${simulation.running ? "" : " · Pozastaveno"}`
    : !board ? "Připraveno. Nastavte parametry a pošlete první desku."
    : board.removedAt !== undefined ? `${boardName(board.id)} byla odebrána s vyměněným magazínem. Simulace je zastavená; můžete poslat další desku.`
    : board.completedAt !== null ? `${boardName(board.id)} dokončena za ${settingNumber(board.completedAt - board.enteredAt)} s. Simulace je zastavená; můžete poslat další desku.`
    : `${boardName(board.id)} · ${location.station.code || location.station.id} · ${location.station.name || (location.station.kind === "buffer" ? "Buffer" : "Dopravník")} · ${statusLabels[simulation.getStationState(location.station)]}${simulation.running ? "" : " · Pozastaveno"}`;
  if (element("test-run-status").textContent !== status) element("test-run-status").textContent = status;
  const machine = simulation.machines.find(item => item.id === Number(element("test-fault-machine").value));
  element("test-trigger-fault").disabled = machine.incidentId !== null;
  const conveyor = simulation.conveyors.find(item => item.id === element("test-stop-conveyor").value);
  element("test-toggle-belt").textContent = conveyor.stopped ? "Uvolnit pás" : "Zastavit pás";
  const swapBuffer = simulation.buffers.find(item => item.id === element("test-swap-buffer").value);
  element("test-swap-magazine").disabled = swapBuffer.boards.length === 0;
  document.querySelectorAll("[data-editor-send]").forEach(button => { button.disabled = !canSend; });
  document.querySelectorAll("[data-editor-belt]").forEach(button => {
    const belt = simulation.conveyors.find(item => item.id === button.dataset.editorBelt);
    button.textContent = belt.stopped ? "Uvolnit pás bez restartu" : "Zastavit pás bez restartu";
  });
}

element("test-settings-form").addEventListener("input", () => {
  testSettingsDirty = true;
  element("test-settings-feedback").textContent = "Nastavení je změněné, zatím není použité.";
  updateSettingPreviews();
  renderTestStatus();
});
element("test-settings-form").addEventListener("invalid", event => {
  let group = event.target.closest("details");
  while (group) {
    group.open = true;
    group = group.parentElement.closest("details");
  }
  element("test-settings-feedback").textContent = event.target.validationMessage;
}, true);
function applyTestSettings() {
  try {
    testSettings = LineSimulation.validateSettings(readTestSettings());
  } catch (error) {
    if (!(error instanceof RangeError) && !(error instanceof TypeError)) throw error;
    element("test-settings-feedback").textContent = error.message;
    notify(error.message);
    return false;
  }
  testSettingsDirty = false;
  restartDemo();
  element("test-settings-feedback").textContent = "Nastavení použito. Prázdná linka je připravená na jednu desku.";
  notify("Nastavení testovací linky použito. Předchozí průběh byl vymazán.");
  return true;
}
element("test-settings-form").addEventListener("submit", event => {
  event.preventDefault();
  applyTestSettings();
});
element("test-defaults").addEventListener("click", () => {
  fillTestForm(LineSimulation.defaultSettings());
  element("test-settings-feedback").textContent = "Výchozí hodnoty jsou ve formuláři. Potvrďte je tlačítkem Použít nastavení.";
});
element("test-realistic").addEventListener("click", () => {
  fillTestForm(LineSimulation.realisticSettings());
  element("test-settings-feedback").textContent = "Realistický profil je ve formuláři. Potvrďte ho tlačítkem Použít nastavení.";
});
element("test-start-continuous").addEventListener("click", () => {
  if (testSettingsDirty || !simulation.manualFeed) return;
  simulation.manualFeed = false;
  simulation.singleBoard = false;
  simulation.feedAt = simulation.time;
  simulation.autoFaults = true;
  element("auto-faults").checked = true;
  simulation.nextFaultAt = simulation.time + simulation.settings.faults.firstAfter;
  simulation.running = true;
  lastFrame = null;
  render();
  document.querySelector(".production-panel").scrollIntoView({ block: "start", behavior: "smooth" });
  notify("Souvislý provoz spuštěn. Automatické poruchy jsou zapnuté; rychlost simulace změníte pod linkou.");
});
element("test-send-board").addEventListener("click", () => {
  if (testSettingsDirty || simulation.inFlight > 0 || !simulation.canLoadMachine(simulation.machines[0])) {
    notify("Desku nelze odeslat. Použijte nastavení, počkejte na předchozí desku nebo opravte vstupní stroj.");
    return;
  }
  const board = simulation.sendBoard();
  trackedBoardId = board.id;
  simulation.running = true;
  lastFrame = null;
  render();
  document.querySelector(".production-panel").scrollIntoView({ block: "start", behavior: "smooth" });
  notify(`${boardName(board.id)} odeslána do testovací linky.`);
});
element("test-trigger-fault").addEventListener("click", () => {
  const machine = simulation.machines.find(item => item.id === Number(element("test-fault-machine").value));
  if (machine.incidentId !== null) {
    notify("Tento stroj již má aktivní poruchu.");
    return;
  }
  simulation.triggerFault(machine.id);
  render();
  notify(`Vyvolána porucha ${machine.code}.${simulation.running ? "" : " Pro průběh opravy spusťte simulaci."}`);
});
element("test-toggle-belt").addEventListener("click", () => {
  const conveyor = simulation.conveyors.find(item => item.id === element("test-stop-conveyor").value);
  simulation.setConveyorStopped(conveyor.id, !conveyor.stopped);
  render();
  notify(`${conveyor.id}: pás ${conveyor.stopped ? "zastaven" : "uvolněn"}.`);
});
element("test-fault-machine").addEventListener("change", renderTestStatus);
element("test-swap-magazine").addEventListener("click", () => {
  const buffer = simulation.buffers.find(item => item.id === element("test-swap-buffer").value);
  if (!buffer.boards.length) {
    notify(`${buffer.id}: magazín je prázdný, není co vyměňovat.`);
    return;
  }
  simulation.swapMagazine(buffer);
  render();
  notify(`${buffer.id}: magazín vyměněn, buffer je prázdný a plní se znovu.`);
});
element("test-swap-buffer").addEventListener("change", renderTestStatus);
element("test-stop-conveyor").addEventListener("change", renderTestStatus);
const REPORT_STORAGE_KEY = "lineflow-test-reports";
let lastReport = null;
const reportNumber = (value, digits = 1) => value === null || value === undefined ? "—" : value.toLocaleString("cs-CZ", { maximumFractionDigits: digits });
const reportPercent = value => value === null || value === undefined ? "—" : `${reportNumber(value * 100, 0)} %`;
const reportTime = seconds => seconds === null || seconds === undefined ? "—"
  : seconds >= 120 ? `${reportNumber(seconds / 60)} min` : `${reportNumber(seconds)} s`;

function readStoredReports() {
  try {
    const stored = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storeReport(report) {
  const summary = {
    runId: report.runId, savedAt: new Date().toISOString(), time: report.time, completed: report.completed,
    rate: report.rate, efficiency: report.efficiency, averageLead: report.averageLead,
    faults: report.incidents.count, downtime: report.incidents.totalDowntime
  };
  try {
    localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify([...readStoredReports().filter(item => item.runId !== report.runId), summary].slice(-10)));
  } catch {
    // Prohlížeč úložiště nepovolil; porovnání s minulým během pak jen nebude k dispozici.
  }
}

function previousReport(report) {
  return readStoredReports().filter(item => item.runId !== report.runId).at(-1) || null;
}

function reportVerdict(report) {
  const level = report.efficiency >= 0.9 ? "velmi dobrá" : report.efficiency >= 0.7 ? "dobrá" : report.efficiency >= 0.5 ? "slabší" : "nízká";
  const bottleneck = report.machines.find(machine => machine.code === report.nominalBottleneck.code);
  const loss = [["porucha", bottleneck.downtime], ["blokace výstupu", bottleneck.blockedTime], ["čekání na desku", bottleneck.idleTime]]
    .reduce((max, item) => item[1] > max[1] ? item : max);
  return `Hotovo ${reportPercent(report.efficiency)} desek oproti ideálu bez poruch (${level}). Nejpomalejší stroj je ${report.nominalBottleneck.code} ${report.nominalBottleneck.name} (${reportTime(report.nominalBottleneck.cycle)} / deska); jeho největší ztráta je ${loss[0]} (${reportTime(loss[1])}).`;
}

function reportDelta(current, previous, better, digits = 1, unit = "") {
  if (previous === null || previous === undefined || current === null || current === undefined) return "—";
  const delta = current - previous;
  if (Math.abs(delta) < 1e-9) return "beze změny";
  const good = better === "higher" ? delta > 0 : delta < 0;
  return `${good ? "▲ lepší" : "▼ horší"} (${delta > 0 ? "+" : ""}${reportNumber(delta, digits)}${unit})`;
}

function reportHtml(report) {
  const previous = previousReport(report);
  const rows = (head, body) => `<table><thead><tr>${head.map(cell => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const comparison = previous ? `<h3>Porovnání s předchozím testem (${new Date(previous.savedAt).toLocaleString("cs-CZ")})</h3>${rows(["Ukazatel", "Předchozí", "Nyní", "Změna"], [
    ["Propustnost (desek/h)", reportNumber(previous.rate), reportNumber(report.rate), reportDelta(report.rate, previous.rate, "higher")],
    ["Využití ideálu (hotové desky)", reportPercent(previous.efficiency), reportPercent(report.efficiency), reportDelta(report.efficiency * 100, previous.efficiency * 100, "higher", 0, " p. b.")],
    ["Průměrná doba průchodu", reportTime(previous.averageLead), reportTime(report.averageLead), reportDelta(report.averageLead, previous.averageLead, "lower", 1, " s")],
    ["Počet poruch", previous.faults, report.incidents.count, "—"],
    ["Celkový prostoj poruch", reportTime(previous.downtime), reportTime(report.incidents.totalDowntime), "—"]
  ])}` : "<p class=\"settings-help\">Zatím není s čím porovnat; po dalším testu se tu objeví srovnání s tímto během.</p>";
  return `<h3>Vyhodnocení testu</h3><p><strong>${reportVerdict(report)}</strong></p>
    ${rows(["Ukazatel", "Ideál (bez poruch)", "Skutečnost"], [
      ["Čas testu", "—", reportTime(report.time)],
      ["Propustnost (desek/h)", reportNumber(report.idealRate), reportNumber(report.rate)],
      ["Doba průchodu desky", reportTime(report.idealLead), `${reportTime(report.averageLead)} (min ${reportTime(report.minLead)}, max ${reportTime(report.maxLead)})`],
      ["Zpomalení průchodu", "1×", report.leadRatio === null ? "—" : `${reportNumber(report.leadRatio, 2)}×`],
      ["Hotových desek", report.idealCompleted, `${report.completed} (${reportPercent(report.efficiency)})`],
      ["Založeno / v lince / odebráno s magazíny", "—", `${report.generated} / ${report.inFlight} / ${report.removed}`],
      ["Nejvytíženější stroj", `${report.nominalBottleneck.code} (nominálně)`, `${report.busiestMachine.code} ${report.busiestMachine.name} (${reportPercent(report.busiestMachine.utilization)})`]
    ])}
    ${comparison}
    <h3>Stroje</h3>${rows(["Stroj", "Takt (s)", "Hotovo", "Využití", "Blokace", "Čekání na desku", "Prostoj poruch", "Poruchy", "Mikrozast."],
      report.machines.map(machine => [`${machine.code} ${machine.name}`, reportNumber(machine.nominalCycle), machine.processed, reportPercent(machine.utilization),
        reportTime(machine.blockedTime), reportTime(machine.idleTime), reportTime(machine.downtime), machine.faults, machine.microStops]))}
    <h3>Buffery</h3>${rows(["Buffer", "Režim", "Kapacita", "Průměrné zaplnění", "Maximum", "Prošlo", "Výměn magazínu"],
      report.buffers.map(buffer => [buffer.id, buffer.mode, buffer.capacity, reportNumber(buffer.averageOccupancy), buffer.maxOccupancy, buffer.processed, buffer.swaps]))}
    <h3>Dopravníky se zdržením</h3>${report.conveyors.some(conveyor => conveyor.blockedTime > 0)
      ? rows(["Pás", "Doba blokace", "Počet blokací"], report.conveyors.filter(conveyor => conveyor.blockedTime > 0)
        .map(conveyor => [conveyor.id, reportTime(conveyor.blockedTime), conveyor.blockedCount])) : "<p>Žádný pás nebyl blokovaný.</p>"}
    <h3>Poruchy</h3><p>Počet: ${report.incidents.count} (automaticky ${report.incidents.auto}) · celkový prostoj ${reportTime(report.incidents.totalDowntime)} · průměrná reakce technika ${reportTime(report.incidents.averageReaction)} · průměrná oprava ${reportTime(report.incidents.averageRepair)}</p>`;
}

function reportText(report) {
  const previous = previousReport(report);
  const lines = [
    "LINEFLOW — PROTOKOL TESTOVACÍ LINKY", `Vytvořeno: ${new Date().toLocaleString("cs-CZ")}`, "",
    reportVerdict(report), "",
    `Čas testu: ${reportTime(report.time)}`,
    `Propustnost: ${reportNumber(report.rate)} desek/h (ideál ${reportNumber(report.idealRate)})`,
    `Hotovo: ${report.completed} desek z ideálních ${report.idealCompleted} (${reportPercent(report.efficiency)})`,
    `Doba průchodu: průměr ${reportTime(report.averageLead)}, min ${reportTime(report.minLead)}, max ${reportTime(report.maxLead)}, ideál ${reportTime(report.idealLead)}`,
    `Založeno ${report.generated}, hotovo ${report.completed}, v lince ${report.inFlight}, odebráno s magazíny ${report.removed}`
  ];
  if (previous) {
    lines.push("", `Porovnání s předchozím testem (${new Date(previous.savedAt).toLocaleString("cs-CZ")}):`,
      `  Propustnost: ${reportNumber(previous.rate)} -> ${reportNumber(report.rate)} desek/h ${reportDelta(report.rate, previous.rate, "higher")}`,
      `  Průměrná doba průchodu: ${reportTime(previous.averageLead)} -> ${reportTime(report.averageLead)}`);
  }
  lines.push("", "STROJE");
  for (const machine of report.machines) {
    lines.push(`  ${machine.code} ${machine.name}: takt ${reportNumber(machine.nominalCycle)} s, hotovo ${machine.processed}, využití ${reportPercent(machine.utilization)}, blokace ${reportTime(machine.blockedTime)}, čekání ${reportTime(machine.idleTime)}, prostoj ${reportTime(machine.downtime)}, poruchy ${machine.faults}, mikrozastavení ${machine.microStops}`);
  }
  lines.push("", "BUFFERY");
  for (const buffer of report.buffers) {
    lines.push(`  ${buffer.id} (${buffer.mode}, kapacita ${buffer.capacity}): průměr ${reportNumber(buffer.averageOccupancy)}, max ${buffer.maxOccupancy}, prošlo ${buffer.processed}, výměn magazínu ${buffer.swaps}`);
  }
  lines.push("", "DOPRAVNÍKY (blokace)");
  for (const conveyor of report.conveyors.filter(item => item.blockedTime > 0)) {
    lines.push(`  ${conveyor.id}: ${reportTime(conveyor.blockedTime)}, ${conveyor.blockedCount}×`);
  }
  lines.push("", `PORUCHY: ${report.incidents.count}, prostoj ${reportTime(report.incidents.totalDowntime)}, reakce ${reportTime(report.incidents.averageReaction)}, oprava ${reportTime(report.incidents.averageRepair)}`,
    "", "NASTAVENÍ TESTU (JSON)", JSON.stringify(report.settings, null, 2));
  return lines.join("\n");
}

function showReport() {
  if (simulation.time <= 0) {
    notify("Test ještě neběžel; není co vyhodnotit.");
    return;
  }
  lastReport = simulation.buildReport();
  const panel = element("test-report");
  panel.innerHTML = reportHtml(lastReport);
  panel.hidden = false;
  element("test-report-download").disabled = false;
  panel.dataset.text = reportText(lastReport);
  storeReport(lastReport);
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

element("test-report-show").addEventListener("click", showReport);
element("test-report-download").addEventListener("click", () => {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([element("test-report").dataset.text], { type: "text/plain;charset=utf-8" }));
  link.href = url;
  link.download = `lineflow-protokol-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});
document.addEventListener("line-rendered", () => {
  if (simulation.time === 0 && !element("test-report").hidden) {
    element("test-report").hidden = true;
    element("test-report-download").disabled = true;
  }
  const limit = Number(element("test-duration").value) * 60;
  if (simulation.manualFeed || simulation.limitHandled || !(limit > 0) || !simulation.running || simulation.time < limit) return;
  simulation.limitHandled = true;
  simulation.running = false;
  showReport();
  notify("Test dosáhl zadané délky. Simulace je zastavená a vyhodnocení je připravené.");
});
document.addEventListener("line-rendered", renderTestStatus);

document.body.insertAdjacentHTML("beforeend", `
  <dialog id="test-technology-detail" class="configuration-dialog" aria-labelledby="test-technology-title">
    <div class="detail-header"><div><div class="eyebrow">NASTAVENÍ HLAVNÍ TECHNOLOGIE</div><h2 id="test-technology-title"></h2></div><button class="close-detail" id="close-technology" type="button" aria-label="Zavřít nastavení technologie">×</button></div>
    <div class="detail-content" id="technology-editor-content"></div>
  </dialog>`);

function openTestSettings(kind, id) {
  if (kind === "machine") openDetail(Number(id));
  else if (kind === "conveyor") openConveyorDetail(id);
  else if (kind === "buffer") openBufferDetail(id);
  else {
    element("test-technology-title").textContent = `Technologie ${id}`;
    mountDeviceEditor(element("technology-editor-content"), kind, id);
    element("test-technology-detail").showModal();
  }
}

function mountDeviceEditor(content, kind, id) {
  let editor = content.querySelector(".test-device-editor");
  if (!editor) {
    editor = document.createElement("section");
    editor.className = "detail-section test-device-editor";
    content.prepend(editor);
  }
  const group = { machine: "machines", conveyor: "conveyors", buffer: "buffers", technology: "technologies" }[kind];
  const code = kind === "machine" ? machineCode(Number(id)) : id;
  const prefix = `${group}.${code}.`;
  editor.innerHTML = `<div class="detail-section-heading"><h3>Nastavení ${kind === "technology" ? `technologie ${id}` : `zařízení ${code}`}</h3><span class="count-badge">Testovací linka</span></div>
    <div class="setting-grid editor-fields"></div><output class="setting-preview editor-preview"></output>
    <p class="editor-help">Úpravy se projeví až po použití nastavení. Použití vyprázdní linku a smaže předchozí průběh; potom můžete poslat jednu desku. ${kind === "machine" ? "Základní cyklus ovlivňuje i společné tempo technologie." : ""}</p>
    <div class="test-editor-actions"><button type="button" class="button" data-editor-apply>Použít nastavení a vyprázdnit test</button><button type="button" class="button primary" data-editor-send>→ Poslat jednu desku</button>${kind === "conveyor" ? `<button type="button" class="button" data-editor-belt="${id}"></button>` : ""}</div>
    <p class="editor-feedback" role="status"></p>`;
  const originals = [...element("test-settings-form").querySelectorAll("[data-setting]")].filter(input => input.dataset.setting.startsWith(prefix));
  for (const original of originals) {
    const label = original.closest("label").cloneNode(true);
    const input = label.querySelector("input, select");
    input.id = `editor-${original.dataset.setting.replaceAll(".", "-")}`;
    input.value = original.value;
    input.checked = original.checked;
    input.dataset.editorSetting = original.dataset.setting;
    delete input.dataset.setting;
    label.htmlFor = input.id;
    editor.querySelector(".editor-fields").appendChild(label);
  }
  const updatePreview = () => {
    editor.querySelector(".editor-preview").textContent = kind === "machine" || kind === "conveyor"
      ? element(`preview-${code}`).textContent : kind === "technology"
        ? "Tempo mění cykly strojů této technologie; pásy mají vlastní rychlost. Časy techniků určují skutečný průběh oprav."
        : "Kapacita, režim (FIFO / Průjezd / Loader / Unloader) a minimální zdržení určují chování zásobníku. Platí i při souvislém provozu.";
  };
  editor.oninput = event => {
    const input = event.target.closest("[data-editor-setting]");
    if (!input) return;
    const original = originals.find(item => item.dataset.setting === input.dataset.editorSetting);
    original.value = input.value;
    original.checked = input.checked;
    element("test-settings-form").dispatchEvent(new Event("input", { bubbles: true }));
    updatePreview();
    editor.querySelector(".editor-feedback").textContent = "Změna je připravená. Použijte nastavení, potom odešlete desku.";
  };
  editor.querySelector("[data-editor-apply]").addEventListener("click", () => {
    if ([...editor.querySelectorAll("input")].some(input => !input.reportValidity())) return;
    if (applyTestSettings()) openTestSettings(kind, id);
    else editor.querySelector(".editor-feedback").textContent = element("test-settings-feedback").textContent;
  });
  editor.querySelector("[data-editor-send]").addEventListener("click", () => {
    content.closest("dialog").close();
    element("test-send-board").click();
  });
  const beltButton = editor.querySelector("[data-editor-belt]");
  if (beltButton) beltButton.addEventListener("click", () => {
    const belt = simulation.conveyors.find(item => item.id === id);
    simulation.setConveyorStopped(id, !belt.stopped);
    render();
    notify(`${id}: pás ${belt.stopped ? "zastaven" : "uvolněn"}.`);
  });
  updatePreview();
  renderTestStatus();
  content.closest("dialog").scrollTop = 0;
}

document.addEventListener("line-detail-opened", event => {
  const { kind, id } = event.detail;
  const dialogId = { machine: "machine-detail", conveyor: "conveyor-detail", buffer: "buffer-detail" }[kind];
  mountDeviceEditor(element(dialogId).querySelector(".detail-content"), kind, id);
});
for (const technology of ["SMT", "THT"]) {
  const band = document.querySelector(`.${technology.toLowerCase()}-band`);
  band.classList.add("technology-configurable");
  band.setAttribute("role", "button");
  band.setAttribute("tabindex", "0");
  band.setAttribute("aria-haspopup", "dialog");
  band.setAttribute("aria-label", `${technology} — nastavení hlavní technologie`);
  band.title = `Kliknutím nastavit technologii ${technology}`;
  band.querySelector(".technology-label").textContent = `${technology} · Nastavení ⚙`;
  band.addEventListener("click", () => openTestSettings("technology", technology));
  band.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTestSettings("technology", technology);
    }
  });
}
element("close-technology").addEventListener("click", () => element("test-technology-detail").close());
element("test-technology-detail").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    element("test-technology-detail").close();
  }
});
element("test-technology-detail").addEventListener("close", () => {
  lastFollowKey = null;
  renderTracking();
});
updateSettingPreviews();
renderTestStatus();
