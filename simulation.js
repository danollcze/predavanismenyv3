(function (root) {
  "use strict";

  const MACHINE_CONFIG = [
    { name: "Loader", description: "Zakládání desek", technology: "SMT", cycle: 2.5 },
    { name: "Tiskárna pasty", description: "Nanášení pájecí pasty", technology: "SMT", cycle: 3.5 },
    { name: "SPI kontrola", description: "Kontrola pájecí pasty", technology: "SMT", cycle: 2.5 },
    { name: "Pick & Place", description: "Osazování součástek", technology: "SMT", cycle: 4 },
    { name: "Reflow pec", description: "Přetavení pájky", technology: "SMT", cycle: 5 },
    { name: "AOI kontrola", description: "Optická inspekce", technology: "SMT", cycle: 3 },
    { name: "THT osazování", description: "Vývodové součástky", technology: "THT", cycle: 4 },
    { name: "Selektivní pájení", description: "Pájení vývodů", technology: "THT", cycle: 4.5 },
    { name: "Funkční test", description: "Elektrická kontrola", technology: "THT", cycle: 3.5 },
    { name: "Unloader", description: "Výstup hotových desek", technology: "THT", cycle: 2 }
  ];
  const FAULTS = {
    SMT: [
      { cause: "Chyba podávání desky", resolution: "Kontrola podavače, úprava vedení a ověření průchodu desky." },
      { cause: "Odchylka procesních parametrů", resolution: "Diagnostika procesu, korekce parametrů a kontrolní cyklus." },
      { cause: "Zablokovaný dopravník", resolution: "Odstranění blokace, kontrola senzorů a zkušební průchod." }
    ],
    THT: [
      { cause: "Chyba polohy součástky", resolution: "Kontrola přípravku, korekce polohy a ověření osazení." },
      { cause: "Odchylka pájecího procesu", resolution: "Kontrola pájecího procesu, úprava nastavení a kontrolní vzorek." },
      { cause: "Chyba testovacího přípravku", resolution: "Kontrola kontaktů přípravku a opakovaný funkční test." }
    ]
  };
  const STEP = 0.25;
  const LINE_LAYOUT = [
    "M01", "D01", "M02", "D02", "D03", "M03", "D04", "B01", "D05", "M04",
    "D06", "M05", "D07", "D08", "D09", "M06", "D10", "B02", "D11", "M07",
    "D12", "M08", "D13", "B03", "D14", "M09", "D15", "M10"
  ];

  const BUFFER_MODES = [
    { name: "FIFO", description: "Magazín v pořadí příchodu: plní se, když navazující linka stojí; plný magazín zastaví linku před ním. Po výměně magazínu je prázdný a plní se znovu." },
    { name: "Průjezd", description: "Buffer nic nezadržuje; deska jím jen projede (jedna pozice)." },
    { name: "Loader", description: "Dávkový zásobník: sbírá desky do naplnění, pak vydá celou dávku a během vydávání nic nepřijímá." },
    { name: "Unloader", description: "Magazín: sbírá desky, až je plný, a pak je vyhazuje dál do linky; během vyprazdňování už přijímá nové." }
  ];
  const REALISTIC_PROFILE = {
    cycles: [8, 18, 20, 26, 22, 18, 28, 30, 25, 8],
    faultWeights: [1, 4, 1, 8, 2, 2, 3, 5, 3, 1],
    machineDelays: { M02: [2, 1], M05: [0, 4], M07: [2, 0], M09: [3, 2] },
    repairFactors: { M04: 1.5, M08: 1.25 },
    microStops: { M02: [5, 4], M04: [8, 6], M07: [15, 5], M09: [3, 8] },
    conveyors: {
      D01: [0.6, 18, 0], D02: [0.5, 18, 0], D03: [0.5, 18, 0], D04: [0.8, 12, 0], D05: [0.5, 18, 0],
      D06: [0.6, 18, 0], D07: [0.5, 12, 0], D08: [0.5, 12, 10], D09: [0.5, 12, 0], D10: [0.6, 18, 0],
      D11: [0.5, 18, 0], D12: [0.8, 15, 0], D13: [0.6, 15, 6], D14: [0.6, 15, 0], D15: [0.5, 18, 0]
    },
    buffers: { B01: [6, 0, 0, 180, 600], B02: [10, 3, 0, 0, 0], B03: [4, 0, 5, 240, 600] },
    technologies: {
      SMT: { speedFactor: 1, faultsEnabled: 1, technicianCount: 2, arrivalMin: 60, arrivalMax: 240, repairMin: 120, repairMax: 900, restart: 30 },
      THT: { speedFactor: 1, faultsEnabled: 1, technicianCount: 1, arrivalMin: 90, arrivalMax: 360, repairMin: 180, repairMax: 1200, restart: 45 }
    },
    faults: { firstAfter: 900, intervalMin: 600, intervalMax: 1800 }
  };

  function mergeSettings(defaults, overrides = {}) {
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      throw new TypeError("Nastavení musí být objekt.");
    }
    for (const key of Object.keys(overrides)) {
      if (!Object.hasOwn(defaults, key)) throw new RangeError(`Neznámé nastavení: ${key}.`);
    }
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => {
      const selected = Object.hasOwn(overrides, key) ? overrides[key] : value;
      if (typeof value === "object") return [key, mergeSettings(value, selected)];
      if (typeof selected !== "number" || !Number.isFinite(selected)) {
        throw new TypeError(`Nastavení ${key} musí být konečné číslo.`);
      }
      return [key, selected];
    }));
  }

  function settingRange(value, min, max, label, step = null) {
    if (!Number.isFinite(value) || value < min || value > max || (step !== null && Math.abs(value / step - Math.round(value / step)) > 1e-8)) {
      throw new RangeError(`${label}: povolený rozsah ${min}–${max}${step === null ? "" : `, krok ${step}`}.`);
    }
  }

  class LineSimulation {
    static defaultSettings() {
      return {
        machines: Object.fromEntries(MACHINE_CONFIG.map((machine, index) =>
          [`M${String(index + 1).padStart(2, "0")}`, { cycle: machine.cycle, faultWeight: 1, loadDelay: 0, unloadDelay: 0, repairFactor: 1, microStopChance: 0, microStopDuration: 0 }])),
        conveyors: Object.fromEntries(LINE_LAYOUT.filter(code => code.startsWith("D")).map(code =>
          [code, { length: 1, speed: 30, wait: 0, stopped: 0 }])),
        buffers: Object.fromEntries(LINE_LAYOUT.filter(code => code.startsWith("B")).map(code =>
          [code, { capacity: 10, mode: 0, holdTime: 0, swapMin: 0, swapMax: 0 }])),
        technologies: Object.fromEntries(["SMT", "THT"].map(technology => [technology, {
          speedFactor: 1, faultsEnabled: 1,
          technicianCount: 1, arrivalMin: 4, arrivalMax: 12, repairMin: 12, repairMax: 30, restart: 3
        }])),
        faults: { firstAfter: 18, intervalMin: 25, intervalMax: 45 }
      };
    }

    static bufferModes() {
      return BUFFER_MODES.map(mode => ({ ...mode }));
    }

    static realisticSettings() {
      const settings = LineSimulation.defaultSettings();
      const profile = REALISTIC_PROFILE;
      Object.values(settings.machines).forEach((machine, index) => {
        machine.cycle = profile.cycles[index];
        machine.faultWeight = profile.faultWeights[index];
      });
      for (const [code, [loadDelay, unloadDelay]] of Object.entries(profile.machineDelays)) {
        Object.assign(settings.machines[code], { loadDelay, unloadDelay });
      }
      for (const [code, [microStopChance, microStopDuration]] of Object.entries(profile.microStops)) {
        Object.assign(settings.machines[code], { microStopChance, microStopDuration });
      }
      for (const [code, repairFactor] of Object.entries(profile.repairFactors)) {
        settings.machines[code].repairFactor = repairFactor;
      }
      for (const [code, [length, speed, wait]] of Object.entries(profile.conveyors)) {
        Object.assign(settings.conveyors[code], { length, speed, wait });
      }
      for (const [code, [capacity, mode, holdTime, swapMin, swapMax]] of Object.entries(profile.buffers)) {
        Object.assign(settings.buffers[code], { capacity, mode, holdTime, swapMin, swapMax });
      }
      for (const technology of Object.keys(settings.technologies)) {
        Object.assign(settings.technologies[technology], profile.technologies[technology]);
      }
      Object.assign(settings.faults, profile.faults);
      return LineSimulation.validateSettings(settings);
    }

    static validateSettings(settings = {}) {
      const result = mergeSettings(LineSimulation.defaultSettings(), settings);
      for (const [code, machine] of Object.entries(result.machines)) {
        settingRange(machine.cycle, STEP, 3600, `${code}: čas cyklu`, STEP);
        settingRange(machine.faultWeight, 0, 10, `${code}: váha poruch`, 1);
        settingRange(machine.loadDelay, 0, 3600, `${code}: zavedení desky`, STEP);
        settingRange(machine.unloadDelay, 0, 3600, `${code}: vyvedení desky`, STEP);
        settingRange(machine.repairFactor, 0.25, 4, `${code}: násobek doby opravy`, 0.25);
        settingRange(machine.microStopChance, 0, 100, `${code}: pravděpodobnost mikrozastavení`, 1);
        settingRange(machine.microStopDuration, 0, 3600, `${code}: délka mikrozastavení`, STEP);
      }
      for (const [code, conveyor] of Object.entries(result.conveyors)) {
        settingRange(conveyor.length, 0.01, 100, `${code}: délka pásu`);
        settingRange(conveyor.speed, 0.1, 1000, `${code}: rychlost pásu`);
        settingRange(conveyor.wait, 0, 3600, `${code}: čekání na konci pásu`, STEP);
        settingRange(conveyor.stopped, 0, 1, `${code}: zastavení pásu`, 1);
      }
      for (const [code, buffer] of Object.entries(result.buffers)) {
        settingRange(buffer.capacity, 1, 20, `${code}: kapacita`, 1);
        settingRange(buffer.mode, 0, BUFFER_MODES.length - 1, `${code}: režim`, 1);
        settingRange(buffer.holdTime, 0, 3600, `${code}: minimální zdržení v bufferu`, STEP);
        settingRange(buffer.swapMin, 0, 3600, `${code}: výměna magazínu, minimum`, 1);
        settingRange(buffer.swapMax, 0, 3600, `${code}: výměna magazínu, maximum`, 1);
        if (buffer.swapMin > buffer.swapMax) throw new RangeError(`${code}: minimum výměny magazínu nesmí být vyšší než maximum.`);
      }
      for (const [technology, config] of Object.entries(result.technologies)) {
        settingRange(config.technicianCount, 0, 5, `${technology}: počet techniků`, 1);
        settingRange(config.speedFactor, 0.25, 4, `${technology}: tempo technologie`, 0.25);
        settingRange(config.faultsEnabled, 0, 1, `${technology}: automatické poruchy`, 1);
        for (const key of ["arrivalMin", "arrivalMax", "repairMin", "repairMax", "restart"]) {
          settingRange(config[key], 1, 3600, `${technology}: ${key}`, 1);
        }
        if (config.arrivalMin > config.arrivalMax || config.repairMin > config.repairMax) {
          throw new RangeError(`${technology}: minimum doby zásahu nesmí být vyšší než maximum.`);
        }
      }
      for (const value of Object.values(result.faults)) settingRange(value, 1, 3600, "Interval poruch", 1);
      if (result.faults.intervalMin > result.faults.intervalMax) {
        throw new RangeError("Minimum intervalu poruch nesmí být vyšší než maximum.");
      }
      return result;
    }

    static conveyorTravelTime(length, speed) {
      settingRange(length, 0.01, 100, "Délka pásu");
      settingRange(speed, 0.1, 1000, "Rychlost pásu");
      return Math.ceil(60 * length / speed / STEP - 1e-9) * STEP;
    }

    constructor(options = {}) {
      this.settings = LineSimulation.validateSettings(options.settings);
      this.baseTime = options.baseTime === undefined ? Date.now() : options.baseTime;
      this.random = options.random || Math.random;
      this.time = 0;
      this.remainder = 0;
      this.running = true;
      this.autoFaults = true;
      this.singleBoard = options.singleBoard === true;
      this.manualFeed = options.manualFeed === true;
      this.generated = 0;
      this.completed = 0;
      this.removed = 0;
      this.boards = new Map();
      this.feedAt = 0;
      this.nextFaultAt = this.settings.faults.firstAfter;
      this.incidents = [];
      this.activity = [];
      this.machines = MACHINE_CONFIG.map((config, index) => ({
        ...config, ...this.settings.machines[`M${String(index + 1).padStart(2, "0")}`],
        kind: "machine", code: `M${String(index + 1).padStart(2, "0")}`,
        cycle: Math.ceil(this.settings.machines[`M${String(index + 1).padStart(2, "0")}`].cycle
          / this.settings.technologies[config.technology].speedFactor / STEP - 1e-9) * STEP,
        id: index + 1, capacity: 1, board: null, remaining: 0, microStops: 0,
        processed: 0, incidentId: null, state: "idle", processingStartedAt: null, resumedAt: null, departures: [],
        activityHistory: [{ at: 0, balance: 0, state: "idle" }]
      }));
      let technology = "SMT";
      this.stations = LINE_LAYOUT.map(code => {
        if (code.startsWith("M")) {
          const machine = this.machines[Number(code.slice(1)) - 1];
          technology = machine.technology;
          return machine;
        }
        if (code.startsWith("D")) {
          const conveyor = this.settings.conveyors[code];
          return { kind: "conveyor", id: code, technology, capacity: 1, board: null, dwell: 0,
            ...conveyor, travelTime: LineSimulation.conveyorTravelTime(conveyor.length, conveyor.speed),
            remaining: 0, state: conveyor.stopped ? "stopped" : "idle", processed: 0,
            blockedSince: conveyor.stopped ? 0 : null, blockedTotal: 0, blockedCount: conveyor.stopped ? 1 : 0,
            activityHistory: [{ at: 0, balance: 0, state: conveyor.stopped ? "stopped" : "idle" }],
            stateHistory: [{ at: 0, state: conveyor.stopped ? "stopped" : "idle", boardId: null,
              reason: conveyor.stopped ? "Pás dopravníku je ručně zastaven." : null }] };
        }
        return { kind: "buffer", id: code, technology, ...this.settings.buffers[code], boards: [], processed: 0, releasing: false, occupancyTime: 0, maxOccupancy: 0,
          swaps: 0, swapDue: null,
          activityHistory: [{ at: 0, balance: 0, state: "empty" }] };
      });
      this.conveyors = this.stations.filter(station => station.kind === "conveyor");
      this.buffers = this.stations.filter(station => station.kind === "buffer");
      let technicianId = 0;
      this.technicians = ["SMT", "THT"].flatMap(technology =>
        Array.from({ length: this.settings.technologies[technology].technicianCount }, (_, index) => ({
          id: ++technicianId, technology, incidentId: null,
          name: index === 0 ? technology === "SMT" ? "Jan Novák" : "Eva Dvořáková" : `Technik ${technology} ${index + 1}`,
          initials: index === 0 ? technology === "SMT" ? "JN" : "ED" : `${technology[0]}${index + 1}`
        })));
      this.addActivity("system", "Ukázka spuštěna. Linka je připravena na vstup desek.");
    }

    addActivity(type, text) {
      this.activity.unshift({ time: this.time, type, text });
      this.activity.length = Math.min(this.activity.length, 12);
    }

    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new RangeError("Časový krok musí být nezáporné konečné číslo.");
      }
      if (!this.running) return;
      this.remainder += seconds;
      while (this.running && this.remainder + 1e-9 >= STEP) {
        this.remainder = Math.max(0, this.remainder - STEP);
        this.time = Math.round((this.time + STEP) * 100) / 100;
        this.tick();
      }
    }

    sendBoard() {
      const first = this.machines[0];
      if (this.singleBoard && this.inFlight > 0) throw new Error("Nejprve musí dokončit průchod předchozí deska.");
      if (!this.canLoadMachine(first)) throw new Error("Vstupní stroj je obsazený nebo má poruchu.");
      const board = { id: ++this.generated, enteredAt: this.time };
      this.loadMachine(first, board);
      this.feedAt = this.time + first.cycle;
      this.addActivity("board", `Deska PCB-${String(board.id).padStart(4, "0")} vstoupila do linky.`);
      return board;
    }

    randomDuration(min, max) {
      return min + Math.floor(this.random() * (max - min + 1));
    }

    setConveyorStopped(conveyorId, stopped) {
      const conveyor = this.conveyors.find(item => item.id === conveyorId);
      if (!conveyor) throw new RangeError("Dopravník neexistuje.");
      if (typeof stopped !== "boolean") throw new TypeError("Stav zastavení musí být ano/ne.");
      conveyor.stopped = stopped;
      conveyor.state = stopped ? "stopped" : conveyor.board ? "moving" : "idle";
      this.recordConveyorStates(0);
      this.addActivity("system", `${conveyor.id}: pás ${stopped ? "zastaven" : "uvolněn"}.`);
    }

    triggerFault(machineId, source = "manual") {
      const machine = this.machines.find(item => item.id === machineId);
      if (!machine) throw new RangeError("Stroj neexistuje.");
      if (machine.incidentId !== null) {
        throw new Error("Tento stroj již má aktivní poruchu. Vyberte jiný stroj.");
      }
      const causes = FAULTS[machine.technology];
      const fault = causes[Math.floor(this.random() * causes.length)];
      const incident = {
        id: this.incidents.length + 1, machineId, machineName: machine.name,
        technology: machine.technology, cause: fault.cause, resolution: fault.resolution,
        source, startedAt: this.time, dispatchedAt: null, arrivedAt: null,
        repairedAt: null, restartedAt: null, technicianId: null,
        arrivalDue: null, repairDue: null, restartDue: null, status: "waiting"
      };
      this.incidents.push(incident);
      machine.incidentId = incident.id;
      machine.state = "fault";
      this.addActivity("fault", `M${String(machine.id).padStart(2, "0")} · ${machine.name}: ${incident.cause}.`);
      this.dispatchTechnicians();
      return incident;
    }

    dispatchTechnicians() {
      for (const technician of this.technicians) {
        if (technician.incidentId !== null) continue;
        const incident = this.incidents.find(item =>
          item.technology === technician.technology && item.status === "waiting");
        if (!incident) continue;
        technician.incidentId = incident.id;
        incident.technicianId = technician.id;
        incident.dispatchedAt = this.time;
        const config = this.settings.technologies[incident.technology];
        incident.arrivalDue = this.time + this.randomDuration(config.arrivalMin, config.arrivalMax);
        incident.status = "dispatched";
        this.addActivity("maintenance", `${technician.name} míří ke stroji M${String(incident.machineId).padStart(2, "0")}.`);
      }
    }

    updateIncidents() {
      for (const incident of this.incidents) {
        if (incident.status === "resolved") continue;
        const machine = this.machines[incident.machineId - 1];
        if (incident.status === "dispatched" && this.time >= incident.arrivalDue) {
          incident.arrivedAt = this.time;
          const config = this.settings.technologies[incident.technology];
          incident.repairDue = this.time + Math.max(1, Math.round(this.randomDuration(config.repairMin, config.repairMax) * machine.repairFactor));
          incident.status = "repairing";
          machine.state = "repairing";
          const technician = this.technicians.find(item => item.id === incident.technicianId);
          this.addActivity("maintenance", `${technician.name} zahájil/a opravu M${String(machine.id).padStart(2, "0")}.`);
        } else if (incident.status === "repairing" && this.time >= incident.repairDue) {
          incident.repairedAt = this.time;
          incident.restartDue = this.time + this.settings.technologies[incident.technology].restart;
          incident.status = "restarting";
          machine.state = "restarting";
          this.addActivity("maintenance", `M${String(machine.id).padStart(2, "0")} · oprava dokončena, probíhá rozjezd.`);
        } else if (incident.status === "restarting" && this.time >= incident.restartDue) {
          incident.restartedAt = this.time;
          incident.status = "resolved";
          machine.incidentId = null;
          machine.resumedAt = this.time;
          machine.state = machine.board ? "running" : "idle";
          const technician = this.technicians.find(item => item.id === incident.technicianId);
          technician.incidentId = null;
          this.addActivity("success", `M${String(machine.id).padStart(2, "0")} · znovu v provozu. Prostoj ${incident.restartedAt - incident.startedAt} s.`);
        }
      }
      this.dispatchTechnicians();
    }

    canLoadMachine(machine) {
      return machine.board === null && machine.incidentId === null;
    }

    loadMachine(machine, board) {
      if (!this.canLoadMachine(machine)) {
        throw new Error("Desku nelze vložit do obsazeného nebo porouchaného stroje.");
      }
      machine.board = board;
      machine.remaining = machine.cycle + machine.loadDelay + machine.unloadDelay;
      if (machine.microStopChance > 0 && this.random() * 100 < machine.microStopChance) {
        machine.remaining += machine.microStopDuration;
        machine.microStops++;
      }
      machine.processingStartedAt = this.time;
      machine.state = "running";
      this.enterStation(machine, board);
    }

    enterStation(station, board) {
      if (!board.visits) {
        board.visits = [];
        board.completedAt = null;
        this.boards.set(board.id, board);
      }
      const previous = board.visits.at(-1);
      if (previous) previous.exitedAt = this.time;
      board.visits.push({
        code: station.code || station.id, name: station.name || (station.kind === "buffer" ? "Buffer" : "Dopravník"),
        kind: station.kind, enteredAt: this.time, exitedAt: null,
        processing: 0, transport: 0, bufferWait: 0, blocked: 0, fault: 0, delays: []
      });
    }

    getBoard(boardId) {
      if (!Number.isInteger(boardId) || boardId < 1 || !this.boards.has(boardId)) {
        throw new RangeError("Deska neexistuje.");
      }
      return this.boards.get(boardId);
    }

    recordBoardTimes() {
      for (const station of this.stations) {
        const boards = station.kind === "buffer" ? station.boards : station.board ? [station.board] : [];
        for (const board of boards) {
          const visit = board.visits.at(-1);
          let category;
          let reason = null;
          if (station.kind === "buffer") {
            category = "bufferWait";
            const next = this.stations[this.stations.indexOf(station) + 1];
            reason = this.describeBufferWait(station) || (this.canAccept(next) ? "Čekání na předání z bufferu."
              : `${next.id}: obsazený výstup; čekání v bufferu ${BUFFER_MODES[station.mode].name}.`);
          } else if (station.kind === "machine" && station.incidentId !== null) {
            category = "fault";
            reason = this.incidents[station.incidentId - 1].cause;
          } else if (station.state === "blocked" || station.state === "stopped") {
            category = "blocked";
            reason = this.getBlockingReason(station);
          } else {
            category = station.kind === "machine" ? "processing" : "transport";
          }
          visit[category] += STEP;
          if (reason !== null) {
            const previous = visit.delays.at(-1);
            if (previous && previous.category === category && previous.reason === reason && previous.endedAt === this.time - STEP) {
              previous.endedAt = this.time;
            } else {
              visit.delays.push({ category, reason, startedAt: this.time - STEP, endedAt: this.time });
            }
          }
        }
      }
    }

    finishMachine(machine) {
      machine.processed++;
      machine.departures.push({ boardId: machine.board.id, startedAt: machine.processingStartedAt, at: this.time });
      machine.departures = machine.departures.filter(departure =>
        this.time - departure.at <= 60 || machine.departures.indexOf(departure) >= machine.departures.length - 20);
      machine.board = null;
      machine.processingStartedAt = null;
      machine.state = "idle";
    }

    bufferCapacity(buffer) {
      return buffer.mode === 1 ? 1 : buffer.capacity;
    }

    canAccept(station) {
      if (station.kind === "machine") return this.canLoadMachine(station);
      if (station.kind === "conveyor") return station.board === null;
      return station.boards.length < this.bufferCapacity(station) && !(station.mode === 2 && station.releasing);
    }

    swapMagazine(buffer, source = "manual") {
      if (!buffer.boards.length) throw new Error("Magazín je prázdný; není co vyměňovat.");
      const count = buffer.boards.length;
      for (const board of buffer.boards.splice(0)) {
        board.visits.at(-1).exitedAt = this.time;
        board.removedAt = this.time;
      }
      this.removed += count;
      buffer.releasing = false;
      buffer.swapDue = null;
      buffer.swaps++;
      this.addActivity("maintenance", `${buffer.id}: ${source === "auto" ? "technik vyměnil" : "vyměněn"} plný magazín (${count} desek odebráno), buffer je prázdný.`);
    }

    swapBufferMagazine(bufferId) {
      const buffer = this.buffers.find(item => item.id === bufferId);
      if (!buffer) throw new RangeError("Buffer neexistuje.");
      this.swapMagazine(buffer);
    }

    updateBuffer(buffer, next, index) {
      if (buffer.swapMax > 0) {
        const stuck = buffer.boards.length >= this.bufferCapacity(buffer) && !this.canAccept(next);
        if (!stuck) {
          buffer.swapDue = null;
        } else {
          if (buffer.swapDue === null) buffer.swapDue = this.time + this.randomDuration(buffer.swapMin, buffer.swapMax);
          if (this.time >= buffer.swapDue) {
            this.swapMagazine(buffer, "auto");
            return;
          }
        }
      }
      const upstreamEmpty = this.stations.slice(0, index).every(station =>
        station.kind === "buffer" ? station.boards.length === 0 : station.board === null);
      const batchMode = buffer.mode === 2 || buffer.mode === 3;
      if (batchMode && !buffer.releasing && buffer.boards.length) {
        const threshold = buffer.capacity;
        // Neúplná dávka se vydá, jakmile před bufferem už žádná deska nečeká.
        buffer.releasing = buffer.boards.length >= threshold || upstreamEmpty;
      }
      if (batchMode ? !buffer.releasing : !buffer.boards.length) return;
      if (this.time - buffer.boards[0].bufferEnteredAt < buffer.holdTime) return;
      if (this.canAccept(next)) {
        this.acceptBoard(next, buffer.boards.shift());
        buffer.processed++;
      }
      if (!buffer.boards.length) buffer.releasing = false;
    }

    describeBufferWait(buffer) {
      const mode = BUFFER_MODES[buffer.mode].name;
      if (buffer.mode === 2 && !buffer.releasing) return `${mode}: sbírá dávku (${buffer.boards.length} / ${buffer.capacity}).`;
      if (buffer.mode === 3 && !buffer.releasing) return `${mode}: plní magazín (${buffer.boards.length} / ${buffer.capacity}).`;
      return null;
    }

    acceptBoard(station, board) {
      if (!this.canAccept(station)) {
        throw new Error("Zařízení je obsazené; nelze do něj předat další desku.");
      }
      if (station.kind === "machine") {
        this.loadMachine(station, board);
      } else if (station.kind === "conveyor") {
        station.board = board;
        station.remaining = station.travelTime;
        station.dwell = station.wait;
        station.state = station.stopped ? "stopped" : "moving";
        this.enterStation(station, board);
      } else {
        station.boards.push(board);
        board.bufferEnteredAt = this.time;
        this.enterStation(station, board);
      }
    }

    updateMachine(machine, next) {
      if (machine.incidentId !== null || (machine.resumedAt === this.time && machine.remaining > 0)) return;
      if (!machine.board) {
        machine.state = "idle";
        return;
      }
      machine.remaining = Math.max(0, machine.remaining - STEP);
      machine.state = "running";
      if (machine.remaining > 0) return;
      if (next && !this.canAccept(next)) {
        machine.state = "blocked";
        return;
      }
      if (next) {
        this.acceptBoard(next, machine.board);
      } else {
        this.completed++;
        machine.board.completedAt = this.time;
        machine.board.visits.at(-1).exitedAt = this.time;
        this.addActivity("success", `PCB-${String(machine.board.id).padStart(4, "0")} · hotová deska opustila linku.`);
      }
      this.finishMachine(machine);
    }

    updateConveyor(conveyor, next) {
      if (conveyor.stopped) {
        conveyor.state = "stopped";
        return;
      }
      if (!conveyor.board) {
        conveyor.state = "idle";
        return;
      }
      if (conveyor.remaining > 0) {
        conveyor.remaining = Math.max(0, conveyor.remaining - STEP);
        conveyor.state = "moving";
        if (conveyor.remaining > 0 || conveyor.dwell > 0) return;
      } else if (conveyor.dwell > 0) {
        conveyor.dwell = Math.max(0, conveyor.dwell - STEP);
        conveyor.state = "moving";
        if (conveyor.dwell > 0) return;
      }
      if (!this.canAccept(next)) {
        conveyor.state = "blocked";
        return;
      }
      this.acceptBoard(next, conveyor.board);
      conveyor.processed++;
      conveyor.board = null;
      conveyor.state = "idle";
    }

    locateBoard(boardId) {
      if (!Number.isInteger(boardId) || boardId < 1) {
        throw new RangeError("Číslo desky musí být kladné celé číslo.");
      }
      for (let index = 0; index < this.stations.length; index++) {
        const station = this.stations[index];
        const board = station.kind === "buffer"
          ? station.boards.find(item => item.id === boardId)
          : station.board && station.board.id === boardId ? station.board : null;
        if (board) return { station, index, board };
      }
      return null;
    }

    getBlockingReason(station) {
      if (station.state === "stopped") return "Pás dopravníku je ručně zastaven.";
      if (station.state !== "blocked") return null;
      const next = this.stations[this.stations.indexOf(station) + 1];
      if (!next) throw new Error("Chybí navazující zařízení.");
      if (next.kind === "buffer") {
        if (next.mode === 2 && next.releasing) return `${next.id}: Loader vydává dávku a nepřijímá desky.`;
        return `${next.id}: buffer je plný (${next.boards.length} / ${this.bufferCapacity(next)}).`;
      }
      if (next.kind === "machine" && next.incidentId !== null) {
        const incident = this.incidents[next.incidentId - 1];
        return `${next.code} · ${next.name}: ${incident.cause}; stroj není v provozu.`;
      }
      return `${next.code || next.id}: obsazeno deskou PCB-${String(next.board.id).padStart(4, "0")}.`;
    }

    recordConveyorStates(elapsed = STEP) {
      for (const conveyor of this.conveyors) {
        const previous = conveyor.stateHistory.at(-1);
        const wasBlocked = previous.state === "blocked" || previous.state === "stopped";
        const isBlocked = conveyor.state === "blocked" || conveyor.state === "stopped";
        if (wasBlocked) conveyor.blockedTotal += elapsed;
        const boardId = conveyor.board ? conveyor.board.id : null;
        if (previous.state !== conveyor.state || previous.boardId !== boardId) {
          if (isBlocked && !wasBlocked) {
            conveyor.blockedSince = this.time;
            conveyor.blockedCount++;
          } else if (!isBlocked) {
            conveyor.blockedSince = null;
          }
          conveyor.stateHistory.push({
            at: this.time, state: conveyor.state, boardId, reason: this.getBlockingReason(conveyor)
          });
        }
        while (conveyor.stateHistory.length > 51 && conveyor.stateHistory[1].at <= this.time - 120) {
          conveyor.stateHistory.shift();
        }
      }
    }

    getStationState(station) {
      if (station.kind !== "buffer") return station.state;
      return station.boards.length === 0 ? "empty"
        : !this.canAccept(station) ? "full" : "waiting";
    }

    getStationReason(station) {
      const state = this.getStationState(station);
      const index = this.stations.indexOf(station);
      const next = this.stations[index + 1];
      if (state === "running") return "Stroj zpracovává desku.";
      if (state === "moving") return "Deska projíždí dopravníkem.";
      if (state === "stopped") return this.getBlockingReason(station);
      if (state === "empty") return "Buffer je prázdný, jeho kapacita je volná.";
      if (station.kind === "machine" && ["fault", "repairing", "restarting"].includes(state)) {
        const phase = { fault: "Odstávka stroje", repairing: "Probíhá oprava", restarting: "Rozjezd po opravě" }[state];
        const incident = station.incidentId === null ? null : this.incidents[station.incidentId - 1];
        return incident ? `${phase}: ${incident.cause}` : `${phase}.`;
      }
      if (state === "blocked") {
        return this.canAccept(next) ? `Čeká na předání do ${next.code || next.id}.` : this.getBlockingReason(station);
      }
      if (station.kind === "buffer") {
        const capacity = state === "full" ? `Buffer je plný (${station.boards.length} / ${this.bufferCapacity(station)}), vstup je blokován.`
          : `Desky čekají v režimu ${BUFFER_MODES[station.mode].name}, část kapacity je volná.`;
        return `${capacity} ${this.canAccept(next) ? `Čeká na předání do ${next.id}.` : `${next.id}: navazující dopravník je obsazený.`}`;
      }
      const previous = this.stations[index - 1];
      if (!previous) {
        if (this.manualFeed && this.inFlight === 0) return "Čeká na ruční odeslání desky.";
        return this.singleBoard && this.inFlight > 0
          ? "Režim jedné desky: čeká na dokončení desky v lince."
          : "Čeká na založení nové desky do linky.";
      }
      const source = `${previous.code || previous.id}${previous.name ? ` · ${previous.name}` : ""}`;
      if (previous.kind === "machine" && previous.incidentId !== null) {
        return `Čeká na desku z ${source}. Předchozí stroj je odstaven: ${this.incidents[previous.incidentId - 1].cause}`;
      }
      return `Čeká na desku z ${source}.`;
    }

    recordStationTimes() {
      for (const buffer of this.buffers) {
        buffer.occupancyTime += buffer.boards.length * STEP;
        buffer.maxOccupancy = Math.max(buffer.maxOccupancy, buffer.boards.length);
      }
      for (const station of this.stations) {
        const previous = station.activityHistory.at(-1);
        const state = this.getStationState(station);
        const point = {
          at: this.time,
          balance: previous.balance + (["running", "moving", "empty"].includes(state) ? -STEP : STEP),
          state,
          reason: this.getStationReason(station)
        };
        if (station.activityHistory.length > 1 && previous.state === point.state && previous.reason === point.reason) {
          station.activityHistory[station.activityHistory.length - 1] = point;
        } else {
          station.activityHistory.push(point);
        }
      }
    }

    getActivityTrend(station, states, descending = false) {
      const history = station.activityHistory;
      const points = [{ at: history[0].at, level: 0 }];
      let total = 0;
      for (let index = 1; index < history.length; index++) {
        const entry = history[index];
        const previous = points.at(-1);
        const elapsed = entry.at - previous.at;
        const matches = states.includes(entry.state);
        if (matches) total += elapsed;
        const rising = descending ? !matches : matches;
        const level = Math.max(0, previous.level + (rising ? elapsed : -elapsed));
        const reachesZero = !rising && previous.level > 0 && previous.level < elapsed;
        if (reachesZero) {
          points.push({ ...entry, at: previous.at + previous.level, level: 0, slope: -1 });
        }
        points.push({ ...entry, level, slope: rising ? 1 : !reachesZero && previous.level > 0 ? -1 : 0 });
      }
      return { points, total };
    }

    tick() {
      const completedBefore = this.completed;
      this.recordStationTimes();
      this.recordBoardTimes();
      this.updateIncidents();
      if (this.autoFaults && this.time >= this.nextFaultAt) {
        const candidates = this.machines.filter(machine => machine.incidentId === null && machine.faultWeight > 0
          && this.settings.technologies[machine.technology].faultsEnabled);
        if (candidates.length) {
          let selected = this.random() * candidates.reduce((sum, machine) => sum + machine.faultWeight, 0);
          const target = candidates.find(machine => (selected -= machine.faultWeight) < 0);
          this.triggerFault(target.id, "auto");
        }
        this.nextFaultAt = this.time + this.randomDuration(this.settings.faults.intervalMin, this.settings.faults.intervalMax);
      } else if (!this.autoFaults) {
        this.nextFaultAt = this.time + this.settings.faults.firstAfter;
      }

      // Downstream first prevents newly handed-off boards from moving twice in one tick.
      for (let index = this.stations.length - 1; index >= 0; index--) {
        const station = this.stations[index];
        const next = this.stations[index + 1];
        if (station.kind === "machine") {
          this.updateMachine(station, next);
        } else if (station.kind === "conveyor") {
          this.updateConveyor(station, next);
        } else {
          this.updateBuffer(station, next, index);
        }
      }
      const first = this.machines[0];
      if (!this.manualFeed && this.time >= this.feedAt && this.canLoadMachine(first) && (!this.singleBoard || this.inFlight === 0)) {
        this.sendBoard();
      }
      this.recordConveyorStates();
      if (this.manualFeed && this.completed > completedBefore && this.inFlight === 0) {
        this.running = false;
        this.remainder = 0;
      }
    }

    idealLeadTime() {
      return this.machines.reduce((sum, machine) => sum + machine.cycle + machine.loadDelay + machine.unloadDelay, 0)
        + this.conveyors.reduce((sum, conveyor) => sum + conveyor.travelTime + conveyor.wait, 0)
        + this.buffers.reduce((sum, buffer) => sum + Math.max(STEP, buffer.holdTime), 0);
    }

    buildReport() {
      const time = this.time;
      const boards = [...this.boards.values()];
      const leadTimes = boards.filter(board => board.completedAt !== null).map(board => board.completedAt - board.enteredAt);
      const mean = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
      const totals = new Map();
      for (const board of boards) {
        for (const visit of board.visits) {
          const total = totals.get(visit.code) || { processing: 0, blocked: 0 };
          total.processing += visit.processing;
          total.blocked += visit.blocked;
          totals.set(visit.code, total);
        }
      }
      const machines = this.machines.map(machine => {
        const total = totals.get(machine.code) || { processing: 0, blocked: 0 };
        const incidents = this.incidents.filter(incident => incident.machineId === machine.id);
        const downtime = incidents.reduce((sum, incident) =>
          sum + (incident.restartedAt === null ? time : incident.restartedAt) - incident.startedAt, 0);
        return {
          code: machine.code, name: machine.name, nominalCycle: machine.cycle + machine.loadDelay + machine.unloadDelay,
          processed: machine.processed, microStops: machine.microStops, faults: incidents.length,
          processingTime: total.processing, blockedTime: total.blocked, downtime,
          idleTime: Math.max(0, time - total.processing - total.blocked - downtime),
          utilization: time > 0 ? total.processing / time : 0
        };
      });
      const incidents = this.incidents.map(incident => ({
        downtime: (incident.restartedAt === null ? time : incident.restartedAt) - incident.startedAt,
        repair: incident.repairedAt !== null && incident.arrivedAt !== null ? incident.repairedAt - incident.arrivedAt : null
      }));
      const bottleneck = machines.reduce((max, machine) => machine.nominalCycle > max.nominalCycle ? machine : max);
      const busiest = machines.reduce((max, machine) => machine.utilization > max.utilization ? machine : max);
      const idealRate = 3600 / bottleneck.nominalCycle;
      const rate = time > 0 ? this.completed / time * 3600 : 0;
      const idealLead = this.idealLeadTime();
      const idealCompleted = time >= idealLead ? Math.floor((time - idealLead) / bottleneck.nominalCycle) + 1 : 0;
      const averageLead = mean(leadTimes);
      return {
        runId: this.baseTime, time, generated: this.generated, completed: this.completed, removed: this.removed, inFlight: this.inFlight,
        rate, idealRate, idealCompleted, efficiency: idealCompleted > 0 ? this.completed / idealCompleted : 0,
        averageLead, minLead: leadTimes.length ? Math.min(...leadTimes) : null,
        maxLead: leadTimes.length ? Math.max(...leadTimes) : null, idealLead,
        leadRatio: averageLead === null ? null : averageLead / idealLead,
        nominalBottleneck: { code: bottleneck.code, name: bottleneck.name, cycle: bottleneck.nominalCycle },
        busiestMachine: { code: busiest.code, name: busiest.name, utilization: busiest.utilization },
        machines,
        buffers: this.buffers.map(buffer => ({
          id: buffer.id, mode: BUFFER_MODES[buffer.mode].name, capacity: this.bufferCapacity(buffer),
          averageOccupancy: time > 0 ? buffer.occupancyTime / time : 0, maxOccupancy: buffer.maxOccupancy,
          processed: buffer.processed, swaps: buffer.swaps
        })),
        conveyors: this.conveyors.map(conveyor => ({
          id: conveyor.id, blockedTime: conveyor.blockedTotal, blockedCount: conveyor.blockedCount
        })),
        incidents: {
          count: incidents.length, auto: this.incidents.filter(incident => incident.source === "auto").length,
          totalDowntime: incidents.reduce((sum, incident) => sum + incident.downtime, 0),
          averageReaction: this.averageReaction,
          averageRepair: mean(incidents.filter(incident => incident.repair !== null).map(incident => incident.repair))
        },
        settings: JSON.parse(JSON.stringify(this.settings))
      };
    }

    get inFlight() {
      return this.machines.filter(machine => machine.board !== null).length
        + this.conveyors.filter(conveyor => conveyor.board !== null).length
        + this.buffers.reduce((total, buffer) => total + buffer.boards.length, 0);
    }

    get activeIncidents() {
      return this.incidents.filter(incident => incident.status !== "resolved");
    }

    get averageReaction() {
      const arrived = this.incidents.filter(incident => incident.arrivedAt !== null);
      return arrived.length
        ? arrived.reduce((sum, incident) => sum + incident.arrivedAt - incident.startedAt, 0) / arrived.length
        : null;
    }
  }

  root.LineSimulation = LineSimulation;
})(globalThis);
