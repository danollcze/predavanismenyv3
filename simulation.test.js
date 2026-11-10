"use strict";

const testResults = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  assert(actual === expected, `${message}: očekáváno ${expected}, získáno ${actual}`);
}

function rejects(action, message) {
  let rejected = false;
  try { action(); } catch (error) {
    assert(error instanceof Error, "Chyba musí mít typ Error");
    rejected = true;
  }
  assert(rejected, message);
}

function createSimulation() {
  const sim = new LineSimulation({ random: () => 0, baseTime: 0 });
  sim.autoFaults = false;
  return sim;
}

function conserved(sim) {
  equal(sim.generated, sim.completed + sim.inFlight, "Žádné desky se neztrácejí ani neduplikují");
  const boards = [
    ...sim.machines.flatMap(machine => machine.board ? [machine.board] : []),
    ...sim.conveyors.flatMap(conveyor => conveyor.board ? [conveyor.board] : []),
    ...sim.buffers.flatMap(buffer => buffer.boards)
  ];
  const ids = boards.map(board => board.id);
  equal(new Set(ids).size, ids.length, "Rozpracované desky mají unikátní ID");
  for (const machine of sim.machines) {
    equal(machine.capacity, 1, "Stroj má jen jednu pozici");
    assert(!("queue" in machine), "Stroj nesmí mít skrytý zásobník");
  }
  for (const conveyor of sim.conveyors) equal(conveyor.capacity, 1, "Dopravník má jen jednu pozici");
  for (const buffer of sim.buffers) {
    equal(buffer.capacity, 10, "Buffer má přesně 10 pozic");
    assert(buffer.boards.length <= 10, "Buffer nesmí překročit 10 desek");
  }
  assert(boards.length <= 55, "Celá linka nemůže překročit 10 + 15 + 30 desek");
}

function test(name, action) {
  try {
    action();
    testResults.push({ name, passed: true });
  } catch (error) {
    testResults.push({ name, passed: false, message: error.message });
    console.error(`FAIL: ${name}`, error);
  }
}

test("Linka má 10 strojů po 1 desce, 15 dopravníků po 1 desce a 3 buffery po 10 deskách", () => {
  const sim = createSimulation();
  equal(sim.machines.length, 10, "Počet strojů");
  equal(sim.conveyors.length, 15, "Počet dopravníků");
  equal(sim.buffers.length, 3, "Počet bufferů");
  equal(sim.machines.filter(machine => machine.technology === "SMT").length, 6, "Počet SMT strojů");
  equal(sim.machines.filter(machine => machine.technology === "THT").length, 4, "Počet THT strojů");
  equal(sim.technicians.length, 2, "Počet techniků");
  equal(sim.averageReaction, null, "Bez zásahů neexistuje průměrná reakce");
  conserved(sim);
});

test("Desky projdou všemi 10 stroji a statistiky zachovávají bilanci", () => {
  const sim = createSimulation();
  for (let index = 0; index < 800; index++) { sim.advance(0.25); conserved(sim); }
  assert(sim.completed >= 25, "Do 200 s musí projít alespoň 25 hotových desek");
  equal(sim.machines[9].processed, sim.completed, "Výstup odpovídá dokončeným deskám");
  sim.machines.forEach((machine, index) => {
    if (index < 9) assert(machine.processed >= sim.machines[index + 1].processed, "Deska nemůže přeskočit stroj");
  });
});

test("Pozastavení zastaví desky, poruchy i všechny časomíry", () => {
  const sim = createSimulation();
  sim.advance(5);
  sim.triggerFault(1);
  sim.running = false;
  const before = JSON.stringify(sim);
  sim.advance(100);
  equal(JSON.stringify(sim), before, "Pozastavená simulace se nemění");
  sim.running = true;
  sim.advance(4);
  equal(sim.incidents[0].arrivedAt, 9, "Zásah pokračuje po obnovení");
});

test("Zlomkové kroky dávají stejný výsledek jako jednorázový posun", () => {
  const one = createSimulation();
  const many = createSimulation();
  one.advance(50);
  for (let index = 0; index < 500; index++) many.advance(0.1);
  equal(many.time, one.time, "Čas je nezávislý na snímkové frekvenci");
  equal(many.generated, one.generated, "Vstup je nezávislý na snímkové frekvenci");
  equal(many.completed, one.completed, "Výstup je nezávislý na snímkové frekvenci");
});

test("Porucha zaznamená začátek, reakci, opravu a skutečný rozjezd", () => {
  const sim = createSimulation();
  const incident = sim.triggerFault(4);
  equal(incident.startedAt, 0, "Začátek poruchy");
  sim.advance(3.75);
  equal(incident.arrivedAt, null, "Technik nesmí dorazit před 4 s");
  sim.advance(0.25);
  equal(incident.arrivedAt, 4, "Příchod technika");
  equal(incident.status, "repairing", "Stav opravy");
  equal(sim.averageReaction, 4, "Reakční čas");
  sim.advance(12);
  equal(incident.repairedAt, 16, "Konec opravy");
  equal(incident.restartedAt, null, "Oprava není totéž co obnovení provozu");
  equal(incident.status, "restarting", "Stroj musí projít rozjezdem");
  sim.advance(3);
  equal(incident.restartedAt, 19, "Obnovení provozu");
  equal(incident.restartedAt - incident.startedAt, 19, "Celkový prostoj");
  equal(sim.activeIncidents.length, 0, "Porucha již není aktivní");
  equal(sim.technicians[0].incidentId, null, "Technik se uvolní");
});

test("Souběžné poruchy SMT čekají ve frontě a čekání patří do reakce", () => {
  const sim = createSimulation();
  const first = sim.triggerFault(1);
  const second = sim.triggerFault(2);
  equal(second.status, "waiting", "Druhá porucha čeká");
  equal(second.technicianId, null, "Technik není přidělen dvakrát");
  sim.advance(19);
  equal(first.status, "resolved", "První zásah je dokončen");
  equal(second.dispatchedAt, 19, "Druhý výjezd až po prvním rozjezdu");
  sim.advance(4);
  equal(second.arrivedAt, 23, "Druhý příchod");
  equal(second.arrivedAt - second.startedAt, 23, "Reakce zahrnuje 19 s čekání a 4 s cestu");
  equal(sim.averageReaction, 13.5, "Průměr obou reakcí");
});

test("SMT a THT technici mohou řešit poruchy současně", () => {
  const sim = createSimulation();
  const smt = sim.triggerFault(3);
  const tht = sim.triggerFault(8);
  assert(smt.technicianId !== tht.technicianId, "Technologie mají různé techniky");
  sim.advance(4);
  equal(smt.arrivedAt, 4, "SMT příchod");
  equal(tht.arrivedAt, 4, "THT příchod");
  equal(sim.activeIncidents.length, 2, "Oba zásahy jsou aktivní");
});

test("Porucha zastaví zpracování desky a po opravě pokračuje stejná deska", () => {
  const sim = createSimulation();
  sim.advance(1);
  const machine = sim.machines[0];
  const boardId = machine.board.id;
  const remaining = machine.remaining;
  sim.triggerFault(1);
  sim.advance(18.75);
  equal(machine.board.id, boardId, "Deska zůstala ve stroji");
  equal(machine.remaining, remaining, "Proces během odstávky nepokračuje");
  sim.advance(2);
  assert(machine.processed >= 1, "Po rozjezdu se deska dokončí");
  conserved(sim);
});

test("Odstávka vytváří protitlak přes dopravníky bez překročení kapacit", () => {
  const sim = new LineSimulation({ random: () => 0.999, baseTime: 0 });
  sim.autoFaults = false;
  sim.advance(80);
  sim.triggerFault(5);
  let wasBlocked = false;
  for (let index = 0; index < 180; index++) {
    sim.advance(0.25);
    conserved(sim);
    if (sim.machines.some(machine => machine.state === "blocked")) wasBlocked = true;
  }
  assert(wasBlocked, "Obsazený dopravník zastaví předchozí stroj");
});

test("Automatické poruchy začnou za 18 s a lze je vypnout", () => {
  const sim = createSimulation();
  sim.autoFaults = true;
  sim.advance(17.75);
  equal(sim.incidents.length, 0, "Žádná automatická chyba před prahem");
  sim.advance(0.25);
  equal(sim.incidents.length, 1, "První chyba přesně v 18 s");
  equal(sim.incidents[0].source, "auto", "Zdroj chyby");
  sim.autoFaults = false;
  sim.advance(200);
  equal(sim.incidents.length, 1, "Vypnutí negeneruje další poruchy");
  equal(sim.incidents[0].status, "resolved", "Existující oprava pokračuje");
});

test("Neplatné vstupy a duplicitní poruchy mají explicitní chybu", () => {
  const sim = createSimulation();
  rejects(() => sim.advance(-1), "Záporný čas musí selhat");
  rejects(() => sim.advance(NaN), "NaN musí selhat");
  rejects(() => sim.advance(Infinity), "Nekonečno musí selhat");
  rejects(() => sim.triggerFault(11), "Neexistující stroj musí selhat");
  sim.triggerFault(1);
  rejects(() => sim.triggerFault(1), "Dvojitá aktivní porucha musí selhat");
  equal(sim.incidents.length, 1, "Duplicitní chyba nesmí vytvořit událost");
});

test("Dlouhý automatický scénář zachovává desky i správné pořadí časů", () => {
  const sim = createSimulation();
  sim.autoFaults = true;
  for (let index = 0; index < 2400; index++) {
    sim.advance(0.25);
    conserved(sim);
  }
  assert(sim.incidents.length >= 15, "Do 10 minut se opakuje více poruch");
  assert(sim.completed > 20, "I s poruchami linka vyrábí");
  assertBoardTimes(sim);
  for (const incident of sim.incidents) {
    if (incident.arrivedAt !== null) assert(incident.arrivedAt >= incident.startedAt, "Příchod po začátku");
    if (incident.repairedAt !== null) assert(incident.repairedAt > incident.arrivedAt, "Oprava po příchodu");
    if (incident.restartedAt !== null) assert(incident.restartedAt > incident.repairedAt, "Rozjezd po opravě");
  }
});

test("Nová instance vynuluje všechny údaje předchozí ukázky", () => {
  const previous = createSimulation();
  previous.advance(100);
  previous.triggerFault(2);
  const fresh = createSimulation();
  equal(fresh.time, 0, "Čas od nuly");
  equal(fresh.generated, 0, "Vstup od nuly");
  equal(fresh.completed, 0, "Výstup od nuly");
  equal(fresh.incidents.length, 0, "Žádné staré poruchy");
  equal(fresh.inFlight, 0, "Žádné staré desky");
});

test("Historie desek měří přesný cyklus a započítává skutečný prostoj", () => {
  const normal = createSimulation();
  normal.advance(10);
  const first = normal.machines[0].departures[0];
  equal(first.at - first.startedAt, normal.machines[0].cycle, "Průchod bez poruchy odpovídá přesnému cyklu");
  const stopped = createSimulation();
  stopped.advance(1);
  const id = stopped.machines[0].board.id;
  stopped.triggerFault(1);
  stopped.advance(25);
  const departure = stopped.machines[0].departures.find(item => item.boardId === id);
  assert(Boolean(departure), "Opraveným strojem prošla původní deska");
  equal(departure.at - departure.startedAt, stopped.machines[0].cycle + 19, "Čas ve stroji zahrnuje celý prostoj");
  assert(stopped.incidents[0].resolution.length > 0, "Porucha má konkrétní způsob řešení");
});

test("Deska skutečně jede 2 s na dopravníku, nikoli současně v dalším stroji", () => {
  const sim = createSimulation();
  sim.advance(2.75);
  const conveyor = sim.conveyors[0];
  equal(conveyor.board.id, 1, "Deska je na dopravníku");
  equal(conveyor.remaining, 2, "Průjezd má délku 2 s");
  equal(sim.machines[1].board, null, "Deska ještě není v dalším stroji");
  sim.advance(1);
  equal(conveyor.board.id, 1, "Uprostřed přesunu je deska stále na dopravníku");
  equal(conveyor.remaining, 1, "Zbývá jedna sekunda");
  sim.running = false;
  sim.advance(20);
  equal(conveyor.remaining, 1, "Pauza zastaví dopravník");
  sim.running = true;
  sim.advance(1);
  equal(conveyor.board, null, "Dopravník se po předání uvolní");
  equal(sim.machines[1].board.id, 1, "Další stroj přijme stejnou desku");
  equal(sim.machines[1].remaining, sim.machines[1].cycle, "Nově předaná deska se nezpracuje ve stejném kroku");
  conserved(sim);
});

test("Obsazený nebo porouchaný stroj drží desku na dopravníku a zastaví přísun", () => {
  const sim = createSimulation();
  sim.advance(2.75);
  sim.triggerFault(2);
  sim.advance(3);
  const conveyor = sim.conveyors[0];
  equal(conveyor.board.id, 1, "První deska zůstane na dopravníku");
  equal(conveyor.state, "blocked", "Dopravník čeká na opravu stroje");
  equal(conveyor.remaining, 0, "Deska čeká na konci dopravníku");
  rejects(() => sim.acceptBoard(conveyor, { id: 9999 }), "Obsazený dopravník musí odmítnout druhou desku");
  equal(sim.machines[0].board.id, 2, "Předchozí stroj drží jen druhou desku");
  equal(sim.machines[0].state, "blocked", "Obsazený dopravník blokuje stroj");
  rejects(() => sim.loadMachine(sim.machines[0], { id: 9999 }), "Obsazený stroj musí odmítnout druhou desku");
  sim.advance(10);
  equal(conveyor.board.id, 1, "Čekající deska nezmizí ani se nepřepíše");
  equal(sim.generated, 2, "Vstup nevytváří další desky do skryté fronty");
  sim.advance(6);
  equal(sim.machines[1].board.id, 1, "Po opravě se přijme první čekající deska");
  conserved(sim);
});

test("Buffer přijme přesně 10 desek, blokuje plný vstup a vyprazdňuje se v pořadí FIFO", () => {
  const sim = createSimulation();
  sim.machines[3].cycle = 1000;
  for (let index = 0; index < 600; index++) { sim.advance(0.25); conserved(sim); }
  const buffer = sim.buffers.find(item => item.id === "B01");
  const before = sim.stations[sim.stations.indexOf(buffer) - 1];
  const after = sim.stations[sim.stations.indexOf(buffer) + 1];
  equal(buffer.boards.length, 10, "Buffer se naplnil deseti skutečnými deskami");
  rejects(() => sim.acceptBoard(buffer, { id: 9999 }), "Plný buffer musí odmítnout jedenáctou desku");
  equal(before.state, "blocked", "Plný buffer blokuje dopravník");
  equal(sim.machines[2].state, "blocked", "Protitlak dosáhne i předchozího stroje");
  const expected = [sim.machines[3].board.id, after.board.id, ...buffer.boards.map(board => board.id)];
  const waiting = before.board.id;
  sim.advance(10);
  equal(before.board.id, waiting, "Při plném bufferu se čekající deska nepřepíše");
  equal(buffer.boards.length, 10, "Plný buffer nepřijme jedenáctou desku");
  sim.machines[3].cycle = 1;
  sim.machines[3].remaining = 0;
  const output = [];
  let processed = sim.machines[3].processed;
  for (let index = 0; index < 800 && output.length < expected.length; index++) {
    sim.advance(0.25);
    conserved(sim);
    if (sim.machines[3].processed !== processed) {
      processed = sim.machines[3].processed;
      output.push(sim.machines[3].departures.at(-1).boardId);
    }
  }
  equal(output.join(","), expected.join(","), "Desky z bufferu se zpracují přesně v pořadí FIFO");
});

test("Buffery leží přímo mezi dvěma dopravníky a před hlavním strojem", () => {
  const sim = createSimulation();
  const ids = sim.stations.map(station => station.code || station.id);
  equal(new Set(ids).size, 28, "Každé zařízení má v trase právě jednu pozici");
  for (const buffer of sim.buffers) {
    const index = sim.stations.indexOf(buffer);
    equal(sim.stations[index - 1].kind, "conveyor", "Před bufferem je dopravník");
    equal(sim.stations[index + 1].kind, "conveyor", "Za bufferem je dopravník");
    equal(sim.stations[index + 2].kind, "machine", "Za výstupním dopravníkem je technologický stroj");
  }
  assert(ids.join(",").includes("M05,D07,D08,D09,M06"), "Někde jsou tři dopravníky za sebou");
});

test("Dva dopravníky za sebou předávají jednu desku postupně bez přeskakování", () => {
  const sim = createSimulation();
  sim.advance(8.25);
  const first = sim.conveyors.find(conveyor => conveyor.id === "D02");
  const second = sim.conveyors.find(conveyor => conveyor.id === "D03");
  equal(first.board.id, 1, "Deska je nejprve na D02");
  equal(second.board, null, "Deska není současně na D03");
  sim.advance(2);
  equal(first.board, null, "D02 se uvolnil");
  equal(second.board.id, 1, "D03 přijal stejnou desku");
  equal(second.remaining, 2, "D03 má vlastní dvousekundový průjezd");
  equal(sim.machines[2].board, null, "Deska ještě není ve stroji M03");
  sim.advance(2);
  equal(sim.machines[2].board.id, 1, "Teprve po obou průjezdech přijme desku M03");
  conserved(sim);
});

test("Ukázka jedné desky drží stejnou desku přes všech 28 zařízení a další pustí až po výstupu", () => {
  const sim = new LineSimulation({ random: () => 0, baseTime: 0, singleBoard: true });
  sim.autoFaults = false;
  const visited = [];
  let original = null;
  for (let index = 0; index < 800 && sim.completed === 0; index++) {
    sim.advance(0.25);
    conserved(sim);
    assert(sim.inFlight <= 1, "V režimu jedné desky není další rozpracovaná deska");
    const location = sim.locateBoard(1);
    if (location) {
      if (original === null) original = location.board;
      equal(location.board, original, "Procesem prochází stále stejný objekt desky");
      const code = location.station.code || location.station.id;
      if (visited.at(-1) !== code) visited.push(code);
      equal(sim.generated, 1, "Dokud první deska neodejde, nová nevstupuje");
    }
  }
  equal(visited.join(","), sim.stations.map(station => station.code || station.id).join(","), "Deska navštívila všechny stroje, dopravníky i buffery v pořadí");
  equal(sim.completed, 1, "První deska opustila linku");
  equal(sim.locateBoard(1), null, "Hotová deska už není v zařízení");
  equal(sim.machines[0].board.id, 2, "Po dokončení začne od vstupu druhá deska");
});

test("Přepnutí na jednu desku nechá stávající desky dojet bez mazání nebo předčasného vstupu", () => {
  const sim = createSimulation();
  sim.advance(20);
  assert(sim.inFlight > 1, "Plná linka dál podporuje více desek");
  const existing = sim.generated;
  sim.singleBoard = true;
  for (let index = 0; index < 800 && sim.generated === existing; index++) {
    sim.advance(0.25);
    conserved(sim);
    if (sim.completed < existing) equal(sim.generated, existing, "Při dojíždění se nevkládají nové desky");
  }
  equal(sim.completed, existing, "Všechny původní desky se dokončily");
  equal(sim.generated, existing + 1, "Pak vstoupí právě jedna další deska");
  equal(sim.inFlight, 1, "Linkou opět prochází jen jedna deska");
  sim.singleBoard = false;
  sim.advance(10);
  assert(sim.inFlight > 1, "Přepnutí zpět obnoví průběžné zakládání desek");
});

test("Historie dopravníku měří přesný začátek, důvod a délku skutečné blokace", () => {
  const sim = createSimulation();
  sim.advance(2.75);
  sim.triggerFault(2);
  sim.advance(2);
  const conveyor = sim.conveyors[0];
  equal(conveyor.blockedSince, 4.75, "Blokace začne po dokončení průjezdu");
  equal(conveyor.blockedCount, 1, "Počet blokací");
  equal(conveyor.blockedTotal, 0, "V okamžiku začátku ještě neuplynul žádný čas blokace");
  assert(sim.getBlockingReason(conveyor).includes("M02"), "Důvod identifikuje blokující stroj");
  equal(conveyor.stateHistory.at(-1).boardId, 1, "Historie identifikuje blokovanou desku");
  sim.advance(5);
  equal(conveyor.blockedTotal, 5, "Doba blokace po pěti sekundách");
  sim.running = false;
  const history = JSON.stringify(conveyor);
  sim.advance(100);
  equal(JSON.stringify(conveyor), history, "Pauza nemění historii ani statistiky dopravníku");
  sim.running = true;
  sim.advance(12);
  equal(conveyor.blockedTotal, 17, "Blokace skončí přesně při obnovení navazujícího stroje");
  equal(conveyor.blockedSince, null, "Aktivní blokace skončila");
  const index = conveyor.stateHistory.findIndex(entry => entry.state === "blocked");
  equal(conveyor.stateHistory[index + 1].at - conveyor.stateHistory[index].at, 17, "Graf i historie mají stejnou délku blokace");
  equal(sim.getBlockingReason(conveyor), null, "Uvolněný dopravník už nemá příčinu blokace");
  rejects(() => sim.locateBoard(0), "Neplatné číslo desky musí mít explicitní chybu");
});

function assertBoardTimes(sim) {
  for (const board of sim.boards.values()) {
    const end = board.completedAt === null ? sim.time : board.completedAt;
    const total = board.visits.reduce((sum, visit) =>
      sum + visit.processing + visit.transport + visit.bufferWait + visit.blocked + visit.fault, 0);
    equal(total, end - board.enteredAt, `Součet časů PCB-${board.id} odpovídá skutečnému pobytu`);
    for (const visit of board.visits) {
      equal(visit.processing + visit.transport + visit.bufferWait + visit.blocked + visit.fault,
        (visit.exitedAt === null ? end : visit.exitedAt) - visit.enteredAt, "Časy každého zařízení se nepřekrývají");
      equal(visit.delays.reduce((sum, delay) => sum + delay.endedAt - delay.startedAt, 0),
        visit.bufferWait + visit.blocked + visit.fault, "Příčiny pokrývají všechna zdržení přesně jednou");
    }
  }
}

test("Více desek má vlastní úplné časové historie a po dokončení konečné časy", () => {
  const sim = createSimulation();
  sim.advance(180);
  assert(sim.inFlight >= 25, "Předplnění má alespoň 25 reálných desek, ne jedinou");
  assertBoardTimes(sim);
  sim.advance(20);
  conserved(sim);
  assertBoardTimes(sim);
  const board = sim.getBoard(1);
  equal(board.visits.length, 28, "První deska má historii všech 28 zařízení");
  equal(board.visits.map(visit => visit.code).join(","), sim.stations.map(station => station.code || station.id).join(","), "Historie respektuje trasu");
  for (const visit of board.visits) {
    const station = sim.stations.find(item => (item.code || item.id) === visit.code);
    if (station.kind === "machine") equal(visit.processing, station.cycle, "Čisté zpracování odpovídá cyklu");
    if (station.kind === "conveyor") equal(visit.transport, station.travelTime, "Čistá přeprava je přesně 2 s");
  }
  const final = JSON.stringify(board);
  sim.advance(40);
  equal(JSON.stringify(sim.getBoard(1)), final, "Hotová deska se již nemění");
  rejects(() => sim.getBoard(0), "Neplatné ID desky musí být odmítnuto");
  rejects(() => sim.getBoard(99999), "Neexistující deska musí být odmítnuta");
});

test("Zdržení konkrétní desky na dopravníku měří přesných 17 s s příčinou na M02", () => {
  const sim = createSimulation();
  sim.advance(2.75);
  sim.triggerFault(2);
  sim.advance(19);
  const visit = sim.getBoard(1).visits.find(item => item.code === "D01");
  equal(visit.transport, 2, "Přeprava se nepočítá do blokace");
  equal(visit.blocked, 17, "Přesná blokace konkrétní desky");
  equal(visit.fault, 0, "Porucha dalšího stroje se nezapočítává podruhé");
  assert(visit.delays.every(delay => delay.reason.includes("M02")), "Příčiny ukazují blokující stroj");
  assertBoardTimes(sim);
});

test("Porucha vlastního stroje se oddělí od zpracování a pauza zastaví časy desek", () => {
  const sim = createSimulation();
  sim.advance(0.25);
  const incident = sim.triggerFault(1);
  sim.advance(19);
  const visit = sim.getBoard(1).visits[0];
  equal(visit.fault, 19, "Příchod, oprava i rozjezd tvoří přesně 19 s odstávky");
  equal(visit.processing, 0, "Odstávka není zpracování");
  assert(visit.delays[0].reason === incident.cause, "Zdržení nese konkrétní chybu");
  sim.running = false;
  const before = JSON.stringify(sim.getBoard(1));
  sim.advance(100);
  equal(JSON.stringify(sim.getBoard(1)), before, "Pauza zastaví historii i zdržení desky");
  sim.running = true;
  sim.advance(2.5);
  equal(visit.processing, 2.5, "Po restartu pokračuje čistý cyklus");
  assertBoardTimes(sim);
});

test("Restart již zpracované desky nevytváří falešný čas zpracování", () => {
  for (const cycle of [10, 1000]) {
    const sim = createSimulation();
    sim.machines[1].cycle = cycle;
    sim.advance(10);
    const board = sim.machines[0].board;
    equal(sim.machines[0].state, "blocked", "Hotová deska čeká na výstup");
    const visit = board.visits.at(-1);
    sim.triggerFault(1);
    sim.advance(19.25);
    equal(visit.processing, 2.5, "Oprava hotové desky nesmí přidat další zpracování");
    equal(visit.fault, 19, "Celá odstávka se počítá pouze do poruchy");
    if (cycle === 1000) equal(sim.locateBoard(board.id).station.code, "M01", "Stále obsazený výstup drží desku");
    else equal(sim.locateBoard(board.id).station.id, "D01", "Volný výstup přijme hotovou desku při restartu");
    assertBoardTimes(sim);
    conserved(sim);
  }
});

test("Plný buffer měří samostatné FIFO čekání každé desky bez překročení kapacity", () => {
  const sim = createSimulation();
  sim.machines[3].cycle = 1000;
  sim.advance(150);
  const buffer = sim.buffers[0];
  equal(buffer.boards.length, 10, "Buffer je reálně plný");
  const board = buffer.boards[3];
  const visit = board.visits.at(-1);
  assert(visit.bufferWait > 0, "Konkrétní deska má změřené čekání");
  const before = visit.bufferWait;
  sim.advance(10);
  equal(visit.bufferWait - before, 10, "Čekání naroste právě o 10 s");
  conserved(sim);
  assertBoardTimes(sim);
});

test("Graf stroje při čekání a odstávkách stoupá, při práci klesá", () => {
  for (const state of ["idle", "blocked", "fault", "repairing", "restarting", "running"]) {
    const sim = createSimulation();
    const machine = sim.machines[0];
    machine.state = state;
    sim.advance(0.25);
    const point = machine.activityHistory.at(-1);
    equal(point.at, 0.25, "Záznam je v simulačním čase");
    equal(point.state, state, "Záznam popisuje stav během měřeného intervalu");
    equal(point.balance, state === "running" ? -0.25 : 0.25, `Směr čáry pro ${state}`);
  }
});

test("Graf stroje navazuje bez skoků a během pauzy se nemění", () => {
  const sim = createSimulation();
  sim.advance(0.25);
  const machine = sim.machines[0];
  equal(machine.activityHistory.at(-1).balance, 0.25, "První interval čeká na vstup");
  sim.advance(0.25);
  equal(machine.activityHistory.at(-1).balance, 0, "Práce naváže klesající čárou");
  const before = JSON.stringify(machine.activityHistory);
  sim.running = false;
  sim.advance(10);
  equal(JSON.stringify(machine.activityHistory), before, "Pauza nepřidává čekání ani body");
});

test("Graf každého stroje drží celé období i bez otevřeného detailu", () => {
  const sim = createSimulation();
  sim.advance(300);
  for (const machine of sim.machines) {
    equal(machine.activityHistory[0].at, 0, "Historie začíná spuštěním simulace");
    equal(machine.activityHistory.at(-1).at, 300, "Historie končí aktuálním časem");
    for (let index = 1; index < machine.activityHistory.length; index++) {
      const previous = machine.activityHistory[index - 1];
      const point = machine.activityHistory[index];
      const elapsed = point.at - previous.at;
      assert(elapsed > 0, "Úseky jdou v čase dopředu");
      equal(point.balance - previous.balance, point.state === "running" ? -elapsed : elapsed, "Sklon odpovídá délce a stavu intervalu");
      if (index > 1) assert(point.state !== previous.state || point.reason !== previous.reason, "Stejný stav se stejnou příčinou je sloučený");
    }
  }
});

test("Dlouhé čekání zachovává začátek historie bez ukládání každého kroku", () => {
  const sim = createSimulation();
  sim.feedAt = Infinity;
  sim.advance(1000);
  for (const machine of sim.machines) {
    equal(machine.activityHistory.length, 2, "Souvislé čekání má jen počátek a konec");
    equal(machine.activityHistory[0].at, 0, "Počátek se nikdy neodřízne");
    equal(machine.activityHistory[1].at, 1000, "Konec čekání je aktuální");
    equal(machine.activityHistory[1].balance, 1000, "Bilance obsahuje celé čekání");
  }
  const fresh = createSimulation();
  equal(fresh.machines[0].activityHistory.length, 1, "Nová simulace začíná s čistou historií");
});

test("Všechna zařízení měří celé období a přesný čas každého stavu", () => {
  const sim = createSimulation();
  const totals = sim.stations.map(() => ({}));
  for (let step = 0; step < 1200; step++) {
    sim.stations.forEach((station, index) => {
      const state = station.kind === "buffer"
        ? station.boards.length === 0 ? "empty" : station.boards.length === station.capacity ? "full" : "waiting"
        : station.state;
      totals[index][state] = (totals[index][state] || 0) + 0.25;
    });
    sim.advance(0.25);
  }
  sim.stations.forEach((station, index) => {
    const history = station.activityHistory;
    equal(history[0].at, 0, "Žádné zařízení neztrácí začátek historie");
    equal(history.at(-1).at, 300, "Historie všech zařízení končí aktuálním časem");
    const measured = {};
    for (let i = 1; i < history.length; i++) {
      const point = history[i];
      const elapsed = point.at - history[i - 1].at;
      assert(elapsed > 0, "Intervaly se nepřekrývají");
      measured[point.state] = (measured[point.state] || 0) + elapsed;
      if (i > 1) assert(point.state !== history[i - 1].state || point.reason !== history[i - 1].reason, "Stejné stavy se stejnou příčinou jsou sloučené");
      assert(typeof point.reason === "string" && point.reason.length > 0, "Každý úsek uchovává vysvětlení");
    }
    for (const [state, seconds] of Object.entries(totals[index])) {
      equal(measured[state], seconds, `${station.code || station.id}: čas stavu ${state}`);
    }
    equal(Object.values(measured).reduce((sum, value) => sum + value, 0), 300, "Grafy dohromady pokrývají celé období");
  });
});

test("Graf bufferu rozlišuje prázdný, částečně obsazený a plný zásobník", () => {
  const sim = createSimulation();
  sim.feedAt = Infinity;
  const buffer = sim.buffers[0];
  const next = sim.stations[sim.stations.indexOf(buffer) + 1];
  sim.advance(1);
  sim.acceptBoard(next, { id: 1, enteredAt: sim.time });
  next.remaining = 1000;
  sim.acceptBoard(buffer, { id: 2, enteredAt: sim.time });
  equal(sim.getStationState(buffer), "waiting", "Částečně obsazený buffer čeká");
  sim.advance(2);
  for (let id = 3; id <= 11; id++) sim.acceptBoard(buffer, { id, enteredAt: sim.time });
  equal(sim.getStationState(buffer), "full", "Plný buffer blokuje vstup");
  sim.advance(3);
  equal(buffer.activityHistory.length, 4, "Počátek a tři samostatné intervaly");
  const intervals = buffer.activityHistory.slice(1).map((point, index) =>
    `${point.state}:${point.at - buffer.activityHistory[index].at}`);
  equal(intervals.join(","), "empty:1,waiting:2,full:3", "Každý graf dostane pouze svůj skutečný čas");
  assert(buffer.activityHistory.at(-1).reason.includes("10 / 10"), "Příčina zachovává plnou kapacitu");
  assert(buffer.activityHistory.at(-1).reason.includes(next.id), "Příčina identifikuje obsazený výstup");
});

test("Pauza zastaví grafy všech zařízení a nová simulace je vynuluje", () => {
  const sim = createSimulation();
  sim.advance(180);
  sim.running = false;
  const before = JSON.stringify(sim.stations.map(station => station.activityHistory));
  sim.advance(100);
  equal(JSON.stringify(sim.stations.map(station => station.activityHistory)), before, "Pauza nezapočítává čekání žádnému zařízení");
  const fresh = createSimulation();
  for (const station of fresh.stations) {
    equal(station.activityHistory.length, 1, "Nová historie má pouze počátek");
    equal(station.activityHistory[0].at, 0, "Nová historie začíná nulou");
  }
});

test("Graf uchová konkrétní poruchu i příčinu blokace navazujícího zařízení", () => {
  const sim = createSimulation();
  sim.advance(2.75);
  const incident = sim.triggerFault(2);
  sim.advance(7);
  const conveyor = sim.conveyors[0];
  const blocked = conveyor.activityHistory.find(point => point.state === "blocked");
  assert(blocked, "Graf obsahuje skutečnou blokaci");
  assert(blocked.reason.includes("M02") && blocked.reason.includes(incident.cause), "Příčina identifikuje blokující stroj i jeho chybu");
  const fault = sim.machines[1].activityHistory.find(point => point.state === "fault");
  assert(fault.reason.includes(incident.cause), "Poruchový graf obsahuje konkrétní chybu");
  const reason = blocked.reason;
  sim.advance(180);
  assert(conveyor.activityHistory.some(point => point.reason === reason), "Příčina nezmizí po opravě ani po 120 sekundách");
  for (const state of ["fault", "repairing", "restarting"]) {
    const interval = sim.machines[1].activityHistory.find(point => point.state === state);
    assert(interval && interval.reason.includes(incident.cause), `Graf zachovává příčinu i pro ${state}`);
  }
});

test("Stejný stav s jinou příčinou zůstane v grafu oddělený", () => {
  const sim = createSimulation();
  const incident = sim.triggerFault(1);
  const original = incident.cause;
  sim.advance(1);
  incident.cause = "Jiná příčina odstávky";
  sim.advance(1);
  const faults = sim.machines[0].activityHistory.filter(point => point.state === "fault");
  equal(faults.length, 2, "Nová příčina vytvoří vlastní interval");
  assert(faults[0].reason.includes(original), "Původní interval se zpětně nepřepíše");
  assert(faults[1].reason.includes(incident.cause), "Nový interval má novou příčinu");
  assert(sim.conveyors[0].activityHistory.at(-1).reason.includes(incident.cause), "Prázdný dopravník vysvětluje odstávku předchozího stroje");
});

test("Poruchový graf tvoří kopce a vrací se k nule přesně rychlostí 1 s za sekundu", () => {
  const sim = createSimulation();
  const station = { activityHistory: [
    { at: 0, state: "idle" },
    { at: 4, state: "fault", reason: "Chyba A" },
    { at: 6, state: "running", reason: "Práce" },
    { at: 9, state: "fault", reason: "Chyba B" },
    { at: 19, state: "running", reason: "Práce" }
  ] };
  const before = JSON.stringify(station);
  const trend = sim.getActivityTrend(station, ["fault", "repairing"]);
  equal(trend.points.map(point => `${point.at}:${point.level}`).join(","), "0:0,4:4,6:2,9:5,14:0,19:0", "Růst, postupný pokles, nový nárůst i přesný bod návratu");
  equal(trend.total, 7, "Skutečný součet poruch se poklesem nemaže");
  equal(trend.points.map(point => point.slope).slice(1).join(","), "1,-1,1,-1,0", "Úseky rozlišují růst, zotavení a normál");
  equal(trend.points[4].reason, "Práce", "Pokles zachovává skutečný důvod obnovy");
  equal(JSON.stringify(station), before, "Vykreslení nepřepisuje historii");
});

test("Všechny druhy grafů mají nulovou mez a postupný návrat", () => {
  const sim = createSimulation();
  const series = [
    { states: ["running"], descending: true, problem: "blocked", normal: "running" },
    { states: ["idle", "blocked", "restarting"], descending: false, problem: "blocked", normal: "running" },
    { states: ["fault", "repairing"], descending: false, problem: "repairing", normal: "running" },
    { states: ["moving"], descending: true, problem: "idle", normal: "moving" },
    { states: ["blocked"], descending: false, problem: "blocked", normal: "moving" },
    { states: ["idle"], descending: false, problem: "idle", normal: "moving" },
    { states: ["empty"], descending: true, problem: "full", normal: "empty" },
    { states: ["waiting"], descending: false, problem: "waiting", normal: "empty" },
    { states: ["full"], descending: false, problem: "full", normal: "empty" }
  ];
  for (const seriesConfig of series) {
    const station = { activityHistory: [
      { at: 0, state: seriesConfig.normal },
      { at: 10, state: seriesConfig.normal, reason: "Normál" },
      { at: 13, state: seriesConfig.problem, reason: "Problém" },
      { at: 23, state: seriesConfig.normal, reason: "Obnovení" }
    ] };
    const trend = sim.getActivityTrend(station, seriesConfig.states, seriesConfig.descending);
    equal(trend.points.map(point => `${point.at}:${point.level}`).join(","), "0:0,10:0,13:3,16:0,23:0", "Kopec se nedotkne záporné hodnoty");
    assert(trend.points.every(point => point.level >= 0), "Odchylka nikdy není záporná");
  }
});

test("Graf správně vykreslí přesný konec poklesu i prázdnou historii", () => {
  const sim = createSimulation();
  const station = { activityHistory: [
    { at: 0, state: "idle" },
    { at: 0.25, state: "fault", reason: "Chyba" },
    { at: 0.5, state: "running", reason: "Práce" }
  ] };
  const trend = sim.getActivityTrend(station, ["fault"]);
  equal(trend.points.length, 3, "Návrat přesně na konci intervalu nevytvoří duplicitní bod");
  equal(trend.points.at(-1).level, 0, "I krátký problém se vrátí přesně k nule");
  equal(trend.points.at(-1).slope, -1, "Poslední úsek skutečně klesá");
  const empty = sim.getActivityTrend(sim.machines[0], ["fault"]);
  equal(empty.points.length, 1, "Před spuštěním je jen výchozí bod");
  equal(empty.points[0].level, 0, "Výchozí odchylka je nula");
  equal(empty.total, 0, "Výchozí součet je nula");
});

test("Výchozí nastavení jsou izolovaná a neplatné parametry mají explicitní chybu", () => {
  const defaults = LineSimulation.defaultSettings();
  defaults.conveyors.D01.speed = 15;
  const sim = createSimulation();
  equal(sim.conveyors[0].speed, 30, "Změna formuláře nemění výchozí výrobní linku");
  for (const settings of [
    { machines: { M01: { cycle: 0 } } }, { machines: { M01: { cycle: 0.3 } } },
    { conveyors: { D01: { speed: 0 } } }, { conveyors: { D01: { length: NaN } } },
    { buffers: { B01: { capacity: 1.5 } } }, { machines: { M99: { cycle: 1 } } },
    { technologies: { SMT: { arrivalMin: 20, arrivalMax: 10 } } },
    { faults: { intervalMin: 50, intervalMax: 10 } }
  ]) rejects(() => new LineSimulation({ settings }), "Neplatné nastavení se nesmí tiše přijmout");
});

test("Nastavení mění skutečné cykly, pásy a kapacity bez sdílení s formulářem", () => {
  const settings = { machines: { M01: { cycle: 8 } }, technologies: { SMT: { speedFactor: 2 } },
    conveyors: { D01: { length: 2, speed: 15 } }, buffers: { B01: { capacity: 3 } } };
  const sim = new LineSimulation({ settings });
  equal(sim.machines[0].cycle, 4, "Tempo technologie upraví čas stroje");
  equal(sim.conveyors[0].travelTime, 8, "Délka 2 m a rychlost 15 m/min znamená 8 s");
  equal(sim.buffers[0].capacity, 3, "Kapacita je skutečně použitá");
  settings.machines.M01.cycle = 100;
  equal(sim.settings.machines.M01.cycle, 8, "Použité nastavení není sdílené s původním objektem");
  equal(LineSimulation.conveyorTravelTime(1, 25), 2.5, "Průjezd se zaokrouhlí nahoru na krok simulace");
});

test("Ruční test zakládá jen jednu desku a zastaví se přesně při dokončení", () => {
  const sim = new LineSimulation({ manualFeed: true, singleBoard: true, random: () => 0 });
  sim.autoFaults = false;
  sim.advance(10);
  equal(sim.generated, 0, "Ani běžící prázdný test automaticky nezaloží desku");
  const board = sim.sendBoard();
  equal(board.enteredAt, 10, "Deska vstoupí v okamžiku kliknutí");
  rejects(() => sim.sendBoard(), "Druhou desku nelze vložit během prvního průchodu");
  sim.advance(1000);
  equal(sim.completed, 1, "Dokončena právě jedna deska");
  equal(sim.generated, 1, "Další deska nevstoupila automaticky");
  equal(board.completedAt - board.enteredAt, 65.25, "Průchod odpovídá součtu cyklů, pásů a předání bufferů");
  equal(sim.time, board.completedAt, "Čas se nepřetočí za dokončení ani při velkém kroku");
  equal(sim.running, false, "Po dokončení se test pozastaví");
  equal(sim.remainder, 0, "Nevyřízený čas nepřeteče do dalšího testu");
  const second = sim.sendBoard();
  equal(second.id, 2, "Další ruční deska má nové ID");
  sim.running = true;
  sim.advance(1000);
  equal(sim.completed, 2, "Druhá deska samostatně dokončí průchod");
  assertBoardTimes(sim);
});

test("Změna rychlosti pásu změní měřitelný pobyt testovací desky", () => {
  const sim = new LineSimulation({ manualFeed: true, singleBoard: true,
    settings: { conveyors: { D01: { length: 2, speed: 15 } } } });
  sim.autoFaults = false;
  const board = sim.sendBoard();
  sim.advance(1000);
  const visit = board.visits.find(item => item.code === "D01");
  equal(visit.transport, 8, "Není změněn jen popisek: deska skutečně jede 8 s");
  equal(board.completedAt, 71.25, "Pomalejší pás prodlouží celkový průchod přesně o 6 s");
});

test("Zastavený pás zachová desku a po uvolnění pokračuje se správnými prostoji", () => {
  const sim = new LineSimulation({ manualFeed: true, singleBoard: true,
    settings: { conveyors: { D01: { stopped: 1 } } } });
  sim.autoFaults = false;
  const board = sim.sendBoard();
  sim.advance(10);
  const conveyor = sim.conveyors[0];
  equal(conveyor.state, "stopped", "Pás zůstává zastavený");
  equal(conveyor.board.id, board.id, "Deska je stále na stejném pásu");
  equal(conveyor.remaining, 2, "Neuběhl žádný transport");
  equal(conveyor.blockedTotal, 10, "Prostoj zařízení zahrnuje i původně prázdný pás");
  equal(board.visits.at(-1).blocked, 7.5, "Deska čeká od okamžiku svého příchodu");
  assert(board.visits.at(-1).delays[0].reason.includes("ručně"), "Příčina prostoje je konkrétní");
  sim.setConveyorStopped("D01", false);
  sim.advance(1000);
  equal(sim.completed, 1, "Po uvolnění deska dokončí celou trasu");
  equal(board.visits.find(visit => visit.code === "D01").transport, 2, "Po uvolnění proběhne celý zbývající průjezd");
  assertBoardTimes(sim);
  rejects(() => sim.setConveyorStopped("D99", true), "Neexistující pás má explicitní chybu");
});

test("Počty a doby zásahu techniků se řídí konfigurací technologie", () => {
  const sim = new LineSimulation({ manualFeed: true, random: () => 0, settings: {
    technologies: { SMT: { technicianCount: 2, arrivalMin: 2, arrivalMax: 2, repairMin: 3, repairMax: 3, restart: 1 } }
  } });
  sim.autoFaults = false;
  const first = sim.triggerFault(1);
  const second = sim.triggerFault(2);
  equal(first.status, "dispatched", "První technik vyrazí");
  equal(second.status, "dispatched", "Druhý technik opravuje souběžně");
  sim.advance(6);
  equal(first.restartedAt, 6, "Příchod 2 s + oprava 3 s + rozjezd 1 s");
  equal(second.restartedAt, 6, "Obě opravy použijí stejné nastavení technologie");
  const absent = new LineSimulation({ manualFeed: true, settings: { technologies: { SMT: { technicianCount: 0 } } } });
  absent.autoFaults = false;
  const waiting = absent.triggerFault(1);
  absent.advance(20);
  equal(waiting.status, "waiting", "Bez technika se chyba sama neopraví");
  rejects(() => absent.sendBoard(), "Na porouchaný vstup nelze poslat desku");
});

test("Automatické poruchy respektují intervaly, technologii a váhy strojů", () => {
  const settings = LineSimulation.defaultSettings();
  for (const machine of Object.values(settings.machines)) machine.faultWeight = 0;
  settings.machines.M07.faultWeight = 3;
  settings.faults = { firstAfter: 2, intervalMin: 5, intervalMax: 5 };
  const sim = new LineSimulation({ manualFeed: true, random: () => 0, settings });
  sim.advance(2);
  equal(sim.incidents.length, 1, "První porucha nastane v nastaveném čase");
  equal(sim.incidents[0].machineId, 7, "Vybere se jediný stroj s nenulovou váhou");
  equal(sim.nextFaultAt, 7, "Další porucha se plánuje za 5 s");
  settings.technologies.THT.faultsEnabled = 0;
  const disabled = new LineSimulation({ manualFeed: true, settings });
  disabled.advance(10);
  equal(disabled.incidents.length, 0, "Technologie bez automatických poruch není vybraná");
});

function stationBoard(sim) {
  const board = { id: ++sim.generated, enteredAt: sim.time };
  return board;
}

function manualRun(settings) {
  const sim = new LineSimulation({ manualFeed: true, singleBoard: true, random: () => 0, settings });
  sim.autoFaults = false;
  sim.sendBoard();
  sim.advance(2000);
  return sim;
}

test("Čekání pásu, zavedení stroje a zdržení v bufferu prodlouží průchod přesně o nastavené časy", () => {
  const base = manualRun({}).boards.get(1);
  equal(base.completedAt - base.enteredAt, 65.25, "Základní průchod");
  const wait = manualRun({ conveyors: { D01: { wait: 5 } } }).boards.get(1);
  equal(wait.completedAt - wait.enteredAt, 70.25, "Čekání pásu přidá 5 s");
  const delays = manualRun({ machines: { M01: { loadDelay: 1, unloadDelay: 2 } } }).boards.get(1);
  equal(delays.completedAt - delays.enteredAt, 68.25, "Zavedení a vyvedení přidá 3 s");
  const hold = manualRun({ buffers: { B01: { holdTime: 10 } } }).boards.get(1);
  equal(hold.completedAt - hold.enteredAt, 75, "Zdržení bufferu 10 s nahradí běžných 0,25 s");
});

test("Mikrozastavení prodlouží zpracování a nové nastavení má přísné meze", () => {
  const sim = new LineSimulation({ random: () => 0, settings: { machines: { M01: { microStopChance: 100, microStopDuration: 3 } } } });
  sim.sendBoard();
  equal(sim.machines[0].remaining, 5.5, "Cyklus 2,5 s + mikrozastavení 3 s");
  equal(sim.machines[0].microStops, 1, "Mikrozastavení se započítá");
  for (const settings of [
    { buffers: { B01: { mode: 4 } } }, { buffers: { B01: { swapMin: 9, swapMax: 3 } } },
    { conveyors: { D01: { wait: 0.3 } } }, { machines: { M01: { microStopChance: 101 } } },
    { machines: { M01: { repairFactor: 0 } } }, { buffers: { B01: { holdTime: -1 } } }
  ]) rejects(() => new LineSimulation({ settings }), "Neplatné nové nastavení se nesmí přijmout");
  const realistic = new LineSimulation({ settings: LineSimulation.realisticSettings() });
  equal(realistic.machines[3].cycle, 26, "Realistický profil nastaví Pick & Place");
  equal(realistic.buffers[1].mode, 3, "Realistický profil nastaví režim bufferu");
});

test("Režimy bufferu: průjezd drží jednu desku, Loader vydává dávku, Unloader plní magazín", () => {
  const prepare = (mode, boards) => {
    const sim = new LineSimulation({ random: () => 0, settings: { buffers: { B01: { capacity: 3, mode } } } });
    const buffer = sim.buffers[0];
    const index = sim.stations.indexOf(buffer);
    sim.machines[0].board = {};
    for (let count = 0; count < boards; count++) sim.acceptBoard(buffer, stationBoard(sim));
    return { sim, buffer, index, next: sim.stations[index + 1] };
  };
  const bypass = prepare(1, 1);
  equal(bypass.sim.bufferCapacity(bypass.buffer), 1, "Průjezd má jednu pozici");
  equal(bypass.sim.canAccept(bypass.buffer), false, "Obsazený průjezd nepřijme další desku");

  const loader = prepare(2, 2);
  loader.sim.updateBuffer(loader.buffer, loader.next, loader.index);
  equal(loader.buffer.boards.length, 2, "Neúplná dávka se nevydává, dokud před bufferem něco čeká");
  loader.sim.acceptBoard(loader.buffer, stationBoard(loader.sim));
  loader.sim.updateBuffer(loader.buffer, loader.next, loader.index);
  equal(loader.buffer.boards.length, 2, "Plná dávka začne vycházet");
  equal(loader.sim.canAccept(loader.buffer), false, "Loader během vydávání nepřijímá");
  loader.next.board = null;
  loader.sim.updateBuffer(loader.buffer, loader.next, loader.index);
  loader.next.board = null;
  loader.sim.updateBuffer(loader.buffer, loader.next, loader.index);
  equal(loader.buffer.boards.length, 0, "Dávka se vydá celá");
  equal(loader.buffer.releasing, false, "Po vyprázdnění se zase plní");

  const unloader = prepare(3, 2);
  unloader.sim.updateBuffer(unloader.buffer, unloader.next, unloader.index);
  equal(unloader.buffer.boards.length, 2, "Neplný magazín se nevyhazuje");
  unloader.sim.acceptBoard(unloader.buffer, stationBoard(unloader.sim));
  unloader.sim.updateBuffer(unloader.buffer, unloader.next, unloader.index);
  equal(unloader.buffer.boards.length, 2, "Plný magazín se začne vyhazovat do linky");
  equal(unloader.sim.canAccept(unloader.buffer), true, "Unloader během vyhazování přijímá nové desky");

  const idle = prepare(2, 1);
  idle.sim.machines[0].board = null;
  idle.sim.updateBuffer(idle.buffer, idle.next, idle.index);
  equal(idle.buffer.boards.length, 0, "Neúplná dávka se vydá, když před bufferem nic není");
});

test("Plný zaseknutý magazín vymění technik a buffer se plní znovu", () => {
  const sim = new LineSimulation({ random: () => 0, settings: { buffers: { B01: { capacity: 2, swapMin: 5, swapMax: 5 } } } });
  const buffer = sim.buffers[0];
  const index = sim.stations.indexOf(buffer);
  const first = stationBoard(sim);
  sim.acceptBoard(buffer, first);
  sim.acceptBoard(buffer, stationBoard(sim));
  sim.stations[index + 1].board = { id: 99 };
  sim.updateBuffer(buffer, sim.stations[index + 1], index);
  equal(buffer.swapDue, 5, "Plánovaná výměna začne od chvíle zaseknutí");
  sim.time = 5;
  sim.updateBuffer(buffer, sim.stations[index + 1], index);
  equal(buffer.boards.length, 0, "Po výměně je magazín prázdný");
  equal(sim.removed, 2, "Odebrané desky se spočítají");
  equal(buffer.swaps, 1, "Výměna se spočítá");
  equal(first.removedAt, 5, "Deska si pamatuje čas odebrání");
  equal(sim.canAccept(buffer), true, "Prázdný magazín znovu přijímá");
  rejects(() => sim.swapBufferMagazine("B01"), "Prázdný magazín nelze vyměnit");
  rejects(() => sim.swapBufferMagazine("B99"), "Neexistující buffer nelze vyměnit");
  sim.acceptBoard(buffer, stationBoard(sim));
  sim.swapBufferMagazine("B01");
  equal(sim.removed, 3, "Ruční výměna odebere desky také");
});

test("Vyhodnocení testu obsahuje ideál, skutečnost a statistiky zařízení", () => {
  const sim = manualRun({});
  const report = sim.buildReport();
  equal(report.completed, 1, "Hotová deska");
  equal(report.idealLead, 65.25, "Ideální průchod");
  equal(report.averageLead, 65.25, "Skutečný průchod bez poruch");
  equal(report.leadRatio, 1, "Bez prostojů není žádné zpomalení");
  equal(report.machines.length, 10, "Statistika všech strojů");
  equal(report.buffers.length, 3, "Statistika všech bufferů");
  equal(report.nominalBottleneck.code, "M05", "Nejpomalejší stroj podle cyklu");
  equal(report.machines[0].processingTime, 2.5, "Stroj M01 zpracovával 2,5 s");
  equal(report.incidents.count, 0, "Žádné poruchy");
  assert(report.buffers.every(buffer => buffer.maxOccupancy === 1), "Deska byla v každém bufferu");
  const empty = new LineSimulation({ random: () => 0 }).buildReport();
  equal(empty.completed, 0, "Prázdný test lze vyhodnotit");
  equal(empty.averageLead, null, "Bez hotových desek není průměr");
});

const passed = testResults.filter(result => result.passed).length;
document.getElementById("test-summary").textContent = `${passed} / ${testResults.length} testů prošlo`;
document.getElementById("test-summary").className = passed === testResults.length ? "pass" : "fail";
for (const result of testResults) {
  const item = document.createElement("li");
  item.className = result.passed ? "pass" : "fail";
  item.textContent = `${result.passed ? "PASS" : "FAIL"} · ${result.name}${result.passed ? "" : ` — ${result.message}`}`;
  document.getElementById("test-results").appendChild(item);
}
globalThis.simulationTestResults = testResults;
