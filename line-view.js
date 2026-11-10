"use strict";

document.getElementById("line-workspace").innerHTML = `
  <main class="line-only">
    <section class="page-heading">
      <div><div class="eyebrow">LINKA 01 · SMT + THT</div><h1 id="line-title">Výrobní linka</h1><p id="line-intro">Klikněte na desku pro její průchod a zdržení, na zařízení pro jeho detail.</p></div>
      <div class="clock-box"><span>SIMULAČNÍ ČAS</span><strong id="clock">—</strong><small id="elapsed">00:00 od spuštění</small></div>
    </section>
    <section class="panel test-settings" id="test-settings" aria-label="Nastavení testovací linky" hidden></section>
    <section class="panel production-panel" aria-label="Stroje a tok desek">
      <div class="panel-heading"><span class="flow-heading" id="line-summary">10 STROJŮ · 15 DOPRAVNÍKŮ · 3 BUFFERY</span><span class="live-badge" id="live-status"><span class="status-dot"></span> Simulace běží</span></div>
      <div class="line-scroll" tabindex="0" aria-label="Stroje, dopravníky a buffery jsou za sebou v jedné trase; pro další část posuňte vodorovně">
        <div class="technology-bands"><div class="smt-band"><span class="technology-label">01 / SMT</span><span>Povrchová montáž · 6 strojů</span></div><div class="tht-band"><span class="technology-label">02 / THT</span><span>Vývodová montáž · 4 stroje</span></div></div>
        <div class="machine-line" id="machine-line"></div>
        <div class="line-endpoints"><span>VSTUP DESEK → <b id="input-count">0 ks</b></span><span>HOTOVÉ DESKY → <b id="output-count">0 ks</b></span></div>
      </div>
      <div class="line-legend" aria-label="Význam světel andonu"><span><i class="legend-dot running"></i> Zelená: běží</span><span><i class="legend-dot fault"></i> Červená: chyba / oprava</span><span><i class="legend-dot blocked"></i> Oranžová: stojí / blokovaný vstup</span><span class="flow-key"><i class="pcb-mini"></i> Tok desek →</span></div>
    </section>
    <section class="controls" aria-label="Ovládání simulace">
      <div class="control-group">
        <button class="button primary" id="toggle-running" type="button">Ⅱ Pozastavit</button>
        <button class="button" id="reset" type="button">↺ Nová ukázka</button>
        <label for="speed">Rychlost</label>
        <select id="speed"><option value="0.25">0,25× velmi pomalu</option><option value="0.5">0,5× pomalu</option><option value="1" selected>1× reálný čas</option><option value="5">5× ukázka</option><option value="20">20× rychle</option></select>
      </div>
      <div class="flow-switches">
        <label class="switch-label"><input id="single-board" type="checkbox"><span class="switch" aria-hidden="true"></span> Pouze jedna deska (volitelná ukázka)</label>
        <label class="switch-label"><input id="auto-follow" type="checkbox"><span class="switch" aria-hidden="true"></span> Sledovat vybranou desku pohledem</label>
        <label class="switch-label"><input id="auto-faults" type="checkbox" checked><span class="switch" aria-hidden="true"></span> Automatické poruchy</label>
      </div>
    </section>
    <p class="demo-caption">Výchozí linka je předplněná skutečným průběhem 3 simulačních minut a průběžně zakládá co nejvíce desek podle volné kapacity. Klikněte na zelenou desku nebo její číslo PCB — uvidíte dobu v lince, průchod zařízeními i jednotlivá zdržení. Vybraná deska je zlatá. Kapacity: stroj 1, dopravník 1, buffer 10.</p>
  </main>
  <dialog id="board-detail" aria-labelledby="board-title">
    <div class="detail-header"><div><div class="eyebrow">DETAIL KONKRÉTNÍ DESKY</div><h2 id="board-title">Deska</h2><p id="board-location"></p></div><button class="close-detail" id="close-board" type="button" aria-label="Zavřít detail desky">×</button></div>
    <div class="detail-content">
      <div class="detail-state-row" id="board-timestamps"></div>
      <section class="metrics detail-metrics" aria-label="Časy vybrané desky">
        <article class="metric"><span>DOBA V LINCE</span><strong id="board-age">—</strong><div>Od vstupu; po dokončení se čas zastaví</div></article>
        <article class="metric"><span>CELKOVÉ ZDRŽENÍ</span><strong id="board-delay">—</strong><div>Buffer + blokovaný výstup + porucha vlastního stroje</div></article>
        <article class="metric"><span>ZPRACOVÁNÍ A PŘEPRAVA</span><strong id="board-work">—</strong><div>Čas bez čekání a odstávek</div></article>
        <article class="metric"><span>PROŠLO ZAŘÍZENÍMI</span><strong id="board-stations">—</strong><div id="board-status"></div></article>
      </section>
      <section class="detail-section"><div class="detail-section-heading"><h3>Rozdělení času desky</h3></div><div id="board-time-chart"></div><p class="detail-footnote">Časy se nepřekrývají. Porucha navazujícího stroje je pro čekající desku blokací výstupu. Pobyt v bufferu zahrnuje i předání v kroku 0,25 s.</p></section>
      <section class="detail-section"><div class="detail-section-heading"><h3>Průchod celou linkou</h3></div><div class="table-scroll"><table><thead><tr><th>Zařízení</th><th>Vstup</th><th>Výstup</th><th>Pobyt</th><th>Zpracování / přeprava</th><th>Buffer</th><th>Blokace</th><th>Porucha</th></tr></thead><tbody id="board-visits"></tbody></table></div></section>
      <section class="detail-section"><div class="detail-section-heading"><h3>Zdržení a jejich příčiny</h3></div><div class="table-scroll"><table><thead><tr><th>Zařízení / příčina</th><th>Začátek</th><th>Do</th><th>Zdržení</th></tr></thead><tbody id="board-delays"></tbody></table></div></section>
    </div>
    <div class="detail-footer"><span>Údaje se měří od vstupu konkrétní desky, ne až od otevření detailu.</span><button class="button" id="board-toggle-running" type="button">Ⅱ Pozastavit</button></div>
  </dialog>
  <dialog id="machine-detail" aria-labelledby="detail-title" aria-describedby="detail-description">
    <div class="detail-header"><div><div class="eyebrow" id="detail-code">DETAIL STROJE</div><h2 id="detail-title">Stroj</h2><p id="detail-description"></p></div><button class="close-detail" id="close-detail" type="button" aria-label="Zavřít detail stroje">×</button></div>
    <div class="detail-content">
      <div class="detail-state-row"><span class="detail-state" id="detail-state"></span><button class="pcb-button board-link" type="button" id="detail-current-board"></button><button class="button danger" id="trigger-fault" type="button">⚡ Vyvolat testovací poruchu</button></div>
      <section class="metrics detail-metrics" aria-label="Rychlost a průchod desek">
        <article class="metric"><span>ČAS CYKLU</span><strong id="detail-cycle">—</strong><div>Čistý čas zpracování jedné desky</div></article>
        <article class="metric"><span>AKTUÁLNÍ PRŮTOK</span><strong id="detail-rate">—</strong><div id="detail-rate-note">Výstup za posledních 60 s simulace</div></article>
        <article class="metric"><span>PROŠLO STROJEM</span><strong id="detail-processed">0</strong><div id="detail-occupancy">Obsazení 0 / 1 · bez zásobníku</div></article>
        <article class="metric"><span>SKUTEČNÝ PRŮCHOD</span><strong id="detail-board-time">—</strong><div>Průměr ve stroji včetně odstávek, posledních 20 desek</div></article>
      </section>
      <section class="detail-section" aria-labelledby="machine-chart-heading">
        <div class="detail-section-heading"><h3 id="machine-chart-heading">Samostatné grafy stavů</h3><span class="muted">Celé období od spuštění simulace</span></div>
        <p class="section-description" id="machine-chart-description">Každý graf ukazuje samostatné kopce od spuštění: sledovaný problém zvyšuje odchylku o 1 s za sekundu, bez něj čára stejně rychle klesá k nule. Pod nulu nejde. Zelený graf stoupá, když stroj nepracuje, a při práci se vrací k nule. Oranžový sleduje čekání / blokaci / rozjezd, červený chybu / opravu. Nula je výchozí stav; doznívající kopec po opravě neznamená trvající chybu. Čas stavu vedle nadpisu je skutečný součet, nikoli výška čáry. Grafy mají vlastní měřítka a společnou časovou osu. Pauza je zastaví, nová ukázka je vynuluje.</p>
        <p class="section-description">Najeďte na úsek čáry, klepněte na něj nebo jej vyberte klávesou Tab pro čas a konkrétní příčinu. Pod každým grafem lze rozbalit všechny příčiny a intervaly.</p>
        <div class="activity-chart" id="machine-chart"></div>
      </section>
      <section class="detail-section" aria-labelledby="detail-fault-title">
        <div class="detail-section-heading"><h3 id="detail-fault-title">Chyby a jejich řešení</h3><span class="count-badge" id="detail-fault-count">0 poruch</span></div>
        <p class="section-description">Začátek chyby → příchod technika → oprava → stroj znovu v provozu. Reakční čas zahrnuje čekání na volného technika.</p>
        <div id="detail-active" class="detail-active" hidden></div>
        <div class="table-scroll"><table><caption class="sr-only">Historie poruch vybraného stroje</caption><thead><tr><th>Chyba / řešení</th><th>Začátek chyby</th><th>Technik / reakce</th><th>Oprava hotova</th><th>Znovu v provozu</th><th>Prostoj</th></tr></thead><tbody id="detail-incidents"></tbody></table></div>
        <p class="detail-footnote" id="detail-technician-note">Posledních 50 poruch tohoto stroje. Jeden technik pro SMT, jeden pro THT.</p>
      </section>
      <section class="detail-section" aria-labelledby="detail-flow-title">
        <div class="detail-section-heading"><h3 id="detail-flow-title">Poslední desky</h3><span class="muted">Posledních 20 průchodů</span></div>
        <div class="table-scroll board-table"><table><caption class="sr-only">Nedávné desky vybraného stroje</caption><thead><tr><th>Deska</th><th>Začátek zpracování</th><th>Výstup ze stroje</th><th>Čas ve stroji</th></tr></thead><tbody id="detail-boards"></tbody></table></div>
      </section>
    </div>
    <div class="detail-footer"><span>Všechny údaje jsou v simulačním čase; rychlost mění i průběh zásahů.</span><button class="button" id="detail-toggle-running" type="button">Ⅱ Pozastavit</button></div>
  </dialog>
  <dialog id="conveyor-detail" aria-labelledby="conveyor-title">
    <div class="detail-header"><div><div class="eyebrow" id="conveyor-code">DETAIL DOPRAVNÍKU</div><h2 id="conveyor-title">Dopravník</h2><p id="conveyor-description"></p></div><button class="close-detail" id="close-conveyor" type="button" aria-label="Zavřít detail dopravníku">×</button></div>
    <div class="detail-content">
      <div class="detail-state-row"><span class="detail-state" id="conveyor-state"></span><button class="pcb-button board-link" type="button" id="conveyor-current-board"></button></div>
      <section class="metrics detail-metrics" aria-label="Stav a blokování dopravníku">
        <article class="metric"><span>OBSAZENÍ</span><strong id="conveyor-capacity">0 / 1</strong><div>Maximálně jedna deska</div></article>
        <article class="metric"><span>ZBÝVÁ PRŮJEZD</span><strong id="conveyor-remaining">—</strong><div id="conveyor-travel-note"></div></article>
        <article class="metric"><span>PROSTOJ CELKEM</span><strong id="conveyor-blocked-total">0 s</strong><div id="conveyor-blocked-count"></div></article>
        <article class="metric"><span>PROŠLO DESEK</span><strong id="conveyor-processed">0</strong><div>Skutečná předání dalšímu zařízení</div></article>
      </section>
      <div id="conveyor-block-reason" class="detail-active" hidden></div>
      <section class="detail-section" aria-labelledby="conveyor-chart-heading">
        <div class="detail-section-heading"><h3 id="conveyor-chart-heading">Samostatné grafy stavů</h3><span class="muted">Celé období od spuštění simulace</span></div>
        <p class="section-description" id="conveyor-chart-description">Každý graf ukazuje samostatné kopce za celé období. Zelený stoupá při nečinnosti a při pohybu desky klesá k nule. Další grafy stoupají při blokaci výstupu nebo čekání na desku a po skončení příslušného problému klesají. Nárůst i pokles je 1 s za sekundu, nejníž na nulu. Výška je odchylka, ne součet prostojů; skutečný čas stavu je uveden u nadpisu. Grafy mají vlastní měřítka a společnou časovou osu. Dopravník nemá vlastní simulované poruchy. Pauza grafy zastaví, nová ukázka je vynuluje.</p>
        <p class="section-description">Najeďte na úsek čáry, klepněte na něj nebo jej vyberte klávesou Tab pro čas a konkrétní příčinu. Pod každým grafem lze rozbalit všechny příčiny a intervaly.</p>
        <div class="activity-chart" id="conveyor-chart"></div>
      </section>
      <section class="detail-section" aria-labelledby="conveyor-history-heading">
        <div class="detail-section-heading"><h3 id="conveyor-history-heading">Historie blokování</h3><span class="muted">Posledních 20 zaznamenaných blokací</span></div>
        <div class="table-scroll"><table><caption class="sr-only">Začátek, konec, délka a příčina blokací dopravníku</caption><thead><tr><th>Deska / příčina</th><th>Začátek</th><th>Uvolnění</th><th>Doba blokování</th></tr></thead><tbody id="conveyor-history"></tbody></table></div>
      </section>
    </div>
    <div class="detail-footer"><span>Graf a časy ukazují skutečný stav simulace, včetně čekání na další zařízení.</span><button class="button" id="conveyor-toggle-running" type="button">Ⅱ Pozastavit</button></div>
  </dialog>
  <dialog id="buffer-detail" aria-labelledby="buffer-title">
    <div class="detail-header"><div><div class="eyebrow" id="buffer-code">DETAIL BUFFERU</div><h2 id="buffer-title">Buffer</h2><p>Samostatný FIFO zásobník přímo v trase linky.</p></div><button class="close-detail" id="close-buffer" type="button" aria-label="Zavřít detail bufferu">×</button></div>
    <div class="detail-content">
      <div class="detail-state-row"><span class="detail-state" id="buffer-state"></span><button class="pcb-button board-link" type="button" id="buffer-current-board"></button></div>
      <section class="metrics detail-metrics" aria-label="Obsazení a průchod bufferem">
        <article class="metric"><span>OBSAZENÍ</span><strong id="buffer-capacity">0 / 10</strong><div>Desky se předávají v pořadí FIFO</div></article>
        <article class="metric"><span>VOLNÉ POZICE</span><strong id="buffer-free">10</strong><div>Plný buffer blokuje předchozí zařízení</div></article>
        <article class="metric"><span>PROŠLO DESEK</span><strong id="buffer-processed">0</strong><div>Skutečná předání dalšímu zařízení</div></article>
        <article class="metric"><span>ČEKÁ PRVNÍ DESKA</span><strong id="buffer-wait">—</strong><div>Čas čekání konkrétní desky v tomto bufferu</div></article>
      </section>
      <section class="detail-section" aria-labelledby="buffer-chart-heading">
        <div class="detail-section-heading"><h3 id="buffer-chart-heading">Samostatné grafy stavů</h3><span class="muted">Celé období od spuštění simulace</span></div>
        <p class="section-description" id="buffer-chart-description">Každý graf ukazuje samostatné kopce za celé období. Zelený stoupá při obsazení bufferu a po vyprázdnění klesá k nule. Další grafy stoupají při částečném obsazení nebo plném bufferu a po skončení příslušného stavu klesají. Nárůst i pokles je 1 s za sekundu, nejníž na nulu. Výška je odchylka, nikoli součet čekání desek. Skutečný čas stavu zařízení je uveden u nadpisu. Grafy mají vlastní měřítka a společnou časovou osu. Pauza je zastaví, nová ukázka je vynuluje. Buffer nemá vlastní simulované poruchy.</p>
        <p class="section-description">Najeďte na úsek čáry, klepněte na něj nebo jej vyberte klávesou Tab pro čas a konkrétní příčinu. Pod každým grafem lze rozbalit všechny příčiny a intervaly.</p>
        <div class="activity-chart" id="buffer-chart"></div>
      </section>
    </div>
    <div class="detail-footer"><span>Celá historie se měří od spuštění, nikoli od otevření detailu.</span><button class="button" id="buffer-toggle-running" type="button">Ⅱ Pozastavit</button></div>
  </dialog>
  <div id="notification" class="notification" role="status" aria-live="polite"></div>
`;
