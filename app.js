/* Vanilla JavaScript only. No API, account, database or build step required. */
(() => {
  'use strict';
  const { states, packages } = window.KARNIKA;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const stateById = new Map(states.map(state => [state.id, state]));
  const money = amount => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(amount);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const mapsURL = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const storageKey = 'karnika-wishlist-v1';
  let selectedId = 'rajasthan';
  let currentTab = 'places';
  let categoryFilter = 'all';
  let stateFilter = null;
  let toastTimer;
  let latestPlan = null;
  let persistentStorage = true;
  let saved = readSaved();

  function readSaved() {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(items)) return [];
      return items.filter(item => {
        if (!item || typeof item.id !== 'string') return false;
        if (item.type === 'state') return stateById.has(item.id);
        if (item.type === 'package') return packages.some(p => p.id === item.id) || (item.id.startsWith('discover-') && stateById.has(item.id.slice(9)));
        return item.type === 'plan' && stateById.has(item.state) && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isInteger(item.travellers) && item.travellers >= 1 && item.travellers <= 12 && Number.isInteger(item.days) && item.days >= 3 && item.days <= 9 && Number.isFinite(item.total) && item.total > 0;
      }).slice(0,100);
    } catch { persistentStorage = false; return []; }
  }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); persistentStorage = true; }
    catch { persistentStorage = false; }
    updateSavedControls();
  }

  function notify(message) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  function isSaved(type, id) { return saved.some(item => item.type === type && item.id === id); }

  function toggleSaved(type, id) {
    if (isSaved(type,id)) {
      saved = saved.filter(item => !(item.type === type && item.id === id));
      persist();
      notify('Removed from your wishlist.');
    } else {
      if (saved.length >= 100) { notify('Your wishlist is full. Remove an item to make room.'); return; }
      saved.push({type,id});
      persist();
      notify(persistentStorage ? 'A little adventure, saved for later.' : 'Saved for this session. Browser storage is unavailable.');
    }
  }

  function updateSavedControls() {
    $('#saved-count').textContent = saved.length;
    const stateSaved = isSaved('state',selectedId);
    $('#save-state').textContent = stateSaved ? '♥' : '♡';
    $('#save-state').setAttribute('aria-pressed',stateSaved);
    $('#save-state').setAttribute('aria-label',`${stateSaved ? 'Unsave' : 'Save'} ${stateById.get(selectedId).name}`);
    $$('.save-package').forEach(button => {
      const active = isSaved('package',button.dataset.id);
      button.textContent = active ? '♥' : '♡';
      button.setAttribute('aria-pressed',active);
      button.setAttribute('aria-label',`${active ? 'Unsave' : 'Save'} ${getPackage(button.dataset.id).title}`);
    });
    if ($('#saved-dialog').open) renderSaved();
  }

  function populateSelects() {
    const ordered = [...states].sort((a,b) => a.name.localeCompare(b.name));
    const options = ordered.map(state => `<option value="${state.id}">${escapeHTML(state.name)}</option>`).join('');
    ['state-select','local-state','plan-state'].forEach(id => { $(`#${id}`).innerHTML = options; $(`#${id}`).value = selectedId; });
    $('#destination-options').innerHTML = ordered.map(state => `<option value="${escapeHTML(state.name)}"></option>`).join('');
  }

  function buildMap() {
    const svg = $('#india-map');
    const ns = 'http://www.w3.org/2000/svg';
    const labelled = new Set(['rajasthan','gujarat','maharashtra','madhya-pradesh','uttar-pradesh','karnataka','tamil-nadu','assam','ladakh']);
    window.KARNIKA_MAP.forEach(region => {
      const state = states.find(item => item.name === region.name);
      if (!state) return;
      const group = document.createElementNS(ns,'g');
      group.classList.add('map-state');
      group.dataset.state = state.id;
      group.setAttribute('role','button');
      group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',`Explore ${state.name}`);
      group.setAttribute('aria-pressed','false');
      const title = document.createElementNS(ns,'title');
      title.textContent = state.name;
      group.append(title);
      region.paths.forEach(d => {
        const path = document.createElementNS(ns,'path');
        path.setAttribute('d',d);
        group.append(path);
      });
      svg.append(group);
      if (labelled.has(state.id)) {
        const box = group.getBBox();
        const label = document.createElementNS(ns,'text');
        label.setAttribute('x',box.x + box.width / 2);
        label.setAttribute('y',box.y + box.height / 2 + 5);
        label.setAttribute('text-anchor','middle');
        label.textContent = ({'madhya-pradesh':'Madhya Pradesh','uttar-pradesh':'Uttar Pradesh','tamil-nadu':'Tamil Nadu'})[state.id] || state.name;
        group.append(label);
      }
    });
    svg.addEventListener('click', event => {
      const region = event.target.closest('[data-state]');
      if (region) selectState(region.dataset.state,true);
    });
    svg.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        const region = event.target.closest('[data-state]');
        if (region) { event.preventDefault(); selectState(region.dataset.state,true); }
      }
    });
    svg.addEventListener('pointermove',event => {
      const region = event.target.closest('[data-state]');
      const tooltip = $('#map-tooltip');
      if (!region) { tooltip.classList.remove('show'); return; }
      const bounds = $('#map-container').getBoundingClientRect();
      tooltip.textContent = stateById.get(region.dataset.state).name;
      tooltip.classList.add('show');
      tooltip.style.left = `${Math.max(0,Math.min(event.clientX-bounds.left+13,bounds.width-tooltip.offsetWidth-5))}px`;
      tooltip.style.top = `${Math.max(0,event.clientY-bounds.top-38)}px`;
    });
    svg.addEventListener('pointerleave',() => $('#map-tooltip').classList.remove('show'));
  }

  function stateVisual(state, withTag = false) {
    const picture = state.image ? `<img src="assets/${state.image}" alt="${escapeHTML(state.name)} travel inspiration" loading="lazy">` : `<div class="abstract-visual" role="img" aria-label="Decorative landscape illustration"><span>${escapeHTML(state.name)}</span></div>`;
    return picture + (withTag ? `<span class="visual-tag">${escapeHTML(state.category.toUpperCase())} & A LITTLE WONDER</span>` : '');
  }

  function selectState(id, announce = false) {
    if (!stateById.has(id)) return;
    selectedId = id;
    const state = stateById.get(id);
    $('#state-select').value = id;
    $('#state-name').textContent = state.name;
    $('#state-region').textContent = `${state.region.toUpperCase()} INDIA · THE ${state.category.toUpperCase()} EDIT`;
    $('#state-description').textContent = state.description;
    $('#state-season').textContent = state.season;
    $('#state-days').textContent = `${state.days} days or more`;
    $('#state-visual').innerHTML = stateVisual(state,true);
    $('#explore-state').innerHTML = `Explore ${escapeHTML(state.name)} journeys <span aria-hidden="true">↗</span>`;
    $$('.map-state').forEach(region => {
      const active = region.dataset.state === id;
      region.classList.toggle('is-selected',active);
      region.setAttribute('aria-pressed',active);
    });
    $('#local-state').value = id;
    renderLocal(id);
    renderTab(currentTab);
    updateSavedControls();
    if (announce) notify(`Exploring ${state.name}. Highlights, stays and local flavours are ready.`);
  }

  function renderTab(tab) {
    currentTab = tab;
    const state = stateById.get(selectedId);
    $$('.state-tabs button').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active);
      button.tabIndex = active ? 0 : -1;
    });
    $('#state-tab-panel').setAttribute('aria-labelledby',`tab-${tab}`);
    const row = (label,query,detail) => `<div class="highlight-row"><a href="${mapsURL(query)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} <span aria-hidden="true">↗</span></a><small>${escapeHTML(detail)}</small></div>`;
    if (tab === 'places') {
      $('#state-tab-panel').innerHTML = state.places.map((place,index) => row(place,`${place}, India`,['Discover','Explore','Wander'][index])).join('');
    } else if (tab === 'stays') {
      $('#state-tab-panel').innerHTML = row('Local guesthouse',`guesthouses in ${state.city}, India`,`${money(Math.round(state.stayPrice*.65/100)*100)} / night`) + row('Boutique stay',`boutique hotels in ${state.city}, India`,`${money(state.stayPrice)} / night`) + '<p class="tab-note">Illustrative room budgets. Links search real stays in '+escapeHTML(state.city)+'.</p>';
    } else {
      $('#state-tab-panel').innerHTML = row(state.food,`${state.food} restaurants in ${state.city}`,`${money(state.mealPrice)} / meal`) + row('Neighbourhood café',`cafes in ${state.city}, India`,`${money(Math.round(state.mealPrice*.7/50)*50)} / person`) + '<p class="tab-note">Illustrative meal budgets. Discover nearby restaurants on Maps.</p>';
    }
  }

  function renderLocal(id) {
    const state = stateById.get(id);
    $('#local-stay-name').textContent = `A boutique pause in ${state.city}`;
    $('#local-stay-description').textContent = `Look for a character-filled local stay in ${state.city}, ${state.name}. An example stay category to inspire your search.`;
    $('#local-stay-price').textContent = `From ${money(state.stayPrice)}`;
    $('#local-stay-map').href = mapsURL(`boutique hotels in ${state.city}, ${state.name}, India`);
    $('#local-food-name').textContent = state.food;
    $('#local-food-description').textContent = `Get to know ${state.city} one plate at a time. Find local kitchens serving this regional favourite.`;
    $('#local-food-price').textContent = `Around ${money(state.mealPrice)}`;
    $('#local-food-map').href = mapsURL(`${state.food} restaurants in ${state.city}, ${state.name}, India`);
  }

  function getPackage(id) {
    const curated = packages.find(item => item.id === id);
    if (curated) return curated;
    const state = stateById.get(id.replace(/^discover-/,''));
    if (!state) return null;
    return {id:`discover-${state.id}`,state:state.id,title:`A little more ${state.name}`,route:`Start in ${state.city} · Choose your own route`,days:state.days,price:state.price,tag:'MAKE IT YOUR OWN',category:state.category,stops:makeStops(state,state.days)};
  }

  function makeStops(state, days) {
    const middle = [
      `Explore the neighbourhoods of ${state.city}`,
      `Consider ${state.places[0]}; confirm travel time and access`,
      'Keep a day for local food, craft and unplanned discoveries',
      `Optional extension: ${state.places[1]}; allow for transfers`,
      'Slow down, revisit a favourite place or take a rest day',
      `Consider an extra stop at ${state.places[2]} if the route allows`,
      'Keep a flexible day for weather and travel changes'
    ];
    return [`Arrive in ${state.city}, settle in and rest`,...middle.slice(0,days-2),`A final breakfast and departure from your chosen base`];
  }

  function packageCard(item) {
    const state = stateById.get(item.state);
    return `<article class="package-card"><div class="package-photo">${stateVisual(state)}<span class="package-tag">${escapeHTML(item.tag)}</span><button class="icon-button save-package" data-id="${item.id}" aria-label="Save ${escapeHTML(item.title)}" aria-pressed="false">♡</button></div><div class="package-content"><div class="package-location">⌖ ${escapeHTML(state.name)}<span>${item.days} days / ${item.days-1} nights</span></div><h3>${escapeHTML(item.title)}</h3><p class="package-route">${escapeHTML(item.route)}</p><div class="package-inclusions"><span>⌂ Stay ideas</span><span>☼ Local discoveries</span><span>⌖ Sample route</span></div><div class="package-bottom"><div class="package-price"><small>ILLUSTRATIVE BUDGET FROM</small><strong>${money(item.price)}</strong><span> / person</span></div><button class="round-arrow" data-package="${item.id}" aria-label="View ${escapeHTML(item.title)} itinerary">↗</button></div></div></article>`;
  }

  function renderPackages() {
    let visible = packages.filter(item => (!stateFilter || item.state === stateFilter) && (categoryFilter === 'all' || item.category === categoryFilter));
    if (stateFilter && !visible.length && categoryFilter === 'all') visible = [getPackage(`discover-${stateFilter}`)];
    const sort = $('#package-sort').value;
    if (sort === 'price-low') visible.sort((a,b) => a.price-b.price);
    if (sort === 'price-high') visible.sort((a,b) => b.price-a.price);
    if (sort === 'duration') visible.sort((a,b) => a.days-b.days);
    $('#package-grid').innerHTML = visible.length ? visible.map(packageCard).join('') : '<div class="empty-state"><h3>A different path, perhaps?</h3><p>No sample journeys match these filters yet.</p><button class="button button-dark" data-action="reset">Explore all journeys ↗</button></div>';
    $('#package-results').textContent = `${visible.length} ${visible.length === 1 ? 'journey' : 'journeys'}${stateFilter ? ` in ${stateById.get(stateFilter).name}` : ' to inspire your next chapter'}`;
    $('#reset-packages').hidden = !stateFilter && categoryFilter === 'all';
    $$('.filter-chip').forEach(button => { const active=button.dataset.filter===categoryFilter; button.classList.toggle('active',active); button.setAttribute('aria-pressed',active); });
    updateSavedControls();
  }

  function resetPackages() { stateFilter = null; categoryFilter = 'all'; $('#discovery-style').value = 'all'; renderPackages(); }

  function showDialog(id) {
    $$('dialog[open]').forEach(dialog => dialog.close());
    $(id).showModal();
    document.body.classList.add('body-modal-open');
  }

  function showPackage(id) {
    const item = getPackage(id);
    if (!item) return;
    const state = stateById.get(item.state);
    $('#detail-dialog').setAttribute('aria-labelledby','detail-title');
    $('#detail-content').innerHTML = `${state.image ? `<img class="detail-photo" src="assets/${state.image}" alt="${escapeHTML(state.name)}">` : ''}<span class="eyebrow">${escapeHTML(state.name.toUpperCase())} · SAMPLE JOURNEY</span><h2 id="detail-title">${escapeHTML(item.title)}</h2><p class="detail-description">${escapeHTML(state.description)}</p><div class="detail-facts"><span>${item.days} days · ${item.days-1} nights</span><span>${money(item.price)} / person, indicative</span><span>${escapeHTML(state.season)}</span></div><ol class="itinerary">${item.stops.map((stop,index) => `<li><span>DAY ${index+1}</span><div>${escapeHTML(stop)}</div></li>`).join('')}</ol><h3 class="inclusions-title">What the sample budget allows for</h3><ul class="inclusions-list"><li>Shared accommodation, simple meals and local travel allowance.</li><li>Excludes travel to the destination, permits, entry fees, insurance and taxes.</li><li>No availability or booking is implied. Check seasonal access and arrange real services separately.</li></ul><div class="plan-actions"><button class="button button-dark" data-plan-state="${state.id}">Make this trip yours ↗</button><button class="button button-cream" data-save-detail="${item.id}">${isSaved('package',item.id)?'Remove from wishlist':'Save this journey ♡'}</button></div>`;
    showDialog('#detail-dialog');
  }

  function openPlanner(id = selectedId) {
    $('#plan-state').value = stateById.has(id) ? id : selectedId;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    $('#plan-date').min = localDate(new Date());
    if (!$('#plan-date').value || $('#plan-date').value < $('#plan-date').min) $('#plan-date').value = localDate(tomorrow);
    latestPlan = null;
    $('#planner-result').innerHTML = '';
    showDialog('#planner-dialog');
  }

  function renderPlan(plan) {
    const state = stateById.get(plan.state);
    const date = new Date(`${plan.date}T12:00:00`);
    const dateText = date.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
    $('#planner-result').innerHTML = `<div class="plan-summary"><span class="eyebrow">YOUR SAMPLE JOURNEY</span><h3>${escapeHTML(state.name)}, your way.</h3><p>${dateText} · ${plan.days} days · ${plan.travellers} ${plan.travellers===1?'traveller':'travellers'}</p><p>Illustrative group budget: <strong>${money(plan.total)}</strong></p></div><ol class="itinerary">${makeStops(state,plan.days).map((stop,index) => `<li><span>DAY ${index+1}</span><div>${escapeHTML(stop)}</div></li>`).join('')}</ol><p class="demo-note">A flexible draft, not a confirmed booking. Budget includes a shared-stay, meal and local-travel allowance; excludes transport to your destination, taxes, permits and entry fees. Check distances, current conditions and seasonal access before finalising your route.</p><div class="plan-actions" style="margin-top:18px"><button class="button button-dark" id="save-plan">${isSaved('plan',plan.id)?'Saved on this device ✓':'Save my trip ♡'}</button><button class="button button-cream" id="download-plan">Download itinerary ↓</button></div>`;
  }

  function renderSaved() {
    if (!saved.length) {
      $('#saved-content').innerHTML = '<div class="empty-state"><h3>Your next adventure starts here.</h3><p>Tap a heart on a destination or journey to keep it close.</p><button class="button button-dark" data-close>Keep exploring ↗</button></div>';
      return;
    }
    $('#saved-content').innerHTML = saved.map(item => {
      let title, detail;
      if (item.type === 'state') { const state = stateById.get(item.id); title=state.name; detail=state.tagline; }
      else if (item.type === 'package') { const pack=getPackage(item.id); title=pack.title; detail=`${pack.days} days · ${money(pack.price)} / person, sample budget`; }
      else { title=`${stateById.get(item.state).name}, your way`; detail=`${item.date} · ${item.days} days · ${item.travellers} travellers`; }
      return `<article class="saved-item"><div><small>${item.type==='state'?'Destination':item.type==='package'?'Sample journey':'Your trip plan'}</small><h3>${escapeHTML(title)}</h3><p>${escapeHTML(detail)}</p></div><div class="saved-item-actions"><button class="icon-button" data-open-saved="${escapeHTML(item.id)}" data-type="${item.type}" aria-label="Open ${escapeHTML(title)}">↗</button><button class="icon-button" data-remove="${escapeHTML(item.id)}" data-type="${item.type}" aria-label="Remove ${escapeHTML(title)}">×</button></div></article>`;
    }).join('');
  }

  function downloadPlan() {
    if (!latestPlan) return;
    const state = stateById.get(latestPlan.state);
    const text = ['KARNIKA — Your sample India journey',state.name,`Start: ${latestPlan.date} | ${latestPlan.days} days | ${latestPlan.travellers} travellers`,`Illustrative group budget: ${money(latestPlan.total)}`,'',...makeStops(state,latestPlan.days).map((stop,index) => `Day ${index+1}: ${stop}`),'','Planning draft only. No booking or payment has been made.','Budget includes a shared-stay, meal and local-travel allowance. Excludes travel to destination, taxes, permits, entry fees and insurance.','Confirm routes, opening times, local conditions and all actual prices independently.'].join('\n');
    const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href=url; link.download=`karnika-${state.id}-itinerary.txt`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    notify('Your itinerary download is ready.');
  }

  function showCredits() {
    $('#detail-dialog').setAttribute('aria-labelledby','credits-title');
    const credits = window.KARNIKA_CREDITS || [];
    $('#detail-content').innerHTML = `<span class="eyebrow">WITH THANKS, AND A LITTLE TRANSPARENCY.</span><h2 id="credits-title">Behind the <em>journey.</em></h2><p class="detail-description">Karnika is an independent frontend demonstration. All prices and packages are illustrative; there are no live bookings, reviews, business partnerships or payments.</p><div class="source-links"><p>Destination reference: <a href="https://www.incredibleindia.gov.in/en" target="_blank" rel="noopener noreferrer">Incredible India, Ministry of Tourism</a>.</p><p>Map geometry: <a href="https://github.com/nikhilsawantse/india-map-studio" target="_blank" rel="noopener noreferrer">India Map Studio</a>, derived from datta07/INDIAN-SHAPEFILES. See <a href="assets/MAP-NOTICES.md" target="_blank" rel="noopener noreferrer">map notices</a>. This stylised map is for discovery, not navigation.</p></div><h3 class="inclusions-title">Photography</h3><ul class="credits-list">${credits.map(item => `<li>${escapeHTML(item.label || item.file || item.filename || 'Travel photograph')} — ${escapeHTML(item.photographer || item.author || 'Unsplash contributor')} · <a href="${escapeHTML(item.source || item.source_page || item.source_url || 'https://unsplash.com')}" target="_blank" rel="noopener noreferrer">View source</a></li>`).join('')}</ul><p class="detail-description">Hotel and food photographs illustrate a style or experience; they do not depict a verified listing. External map searches open Google Maps. Saved journeys stay in your browser storage and can be removed from your wishlist.</p>`;
    showDialog('#detail-dialog');
  }

  function setupEvents() {
    $('#state-select').addEventListener('change',event => selectState(event.target.value,true));
    $('#local-state').addEventListener('change',event => renderLocal(event.target.value));
    $('#save-state').addEventListener('click',() => toggleSaved('state',selectedId));
    $('#explore-state').addEventListener('click',() => { stateFilter=selectedId;categoryFilter='all';renderPackages();$('#journeys').scrollIntoView({behavior:'smooth'}); });
    $$('.state-tabs button').forEach((button,index,buttons) => {
      button.addEventListener('click',() => renderTab(button.dataset.tab));
      button.addEventListener('keydown',event => {
        let next=index;
        if (event.key==='ArrowRight') next=(index+1)%buttons.length;
        else if (event.key==='ArrowLeft') next=(index+buttons.length-1)%buttons.length;
        else if (event.key==='Home') next=0;
        else if (event.key==='End') next=buttons.length-1;
        else return;
        event.preventDefault(); renderTab(buttons[next].dataset.tab); buttons[next].focus();
      });
    });
    $('.menu-toggle').addEventListener('click',() => {
      const open=$('#main-nav').classList.toggle('open');
      $('.menu-toggle').setAttribute('aria-expanded',open);
      $('.menu-toggle').setAttribute('aria-label',open?'Close navigation':'Open navigation');
    });
    $$('#main-nav a').forEach(link => link.addEventListener('click',() => {$('#main-nav').classList.remove('open');$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','Open navigation');}));
    document.addEventListener('keydown',event => { if(event.key==='Escape') {$('#main-nav').classList.remove('open');$('.menu-toggle').setAttribute('aria-expanded','false');} });
    $$('.filter-chip').forEach(button => button.addEventListener('click',() => {categoryFilter=button.dataset.filter;renderPackages();}));
    $('#package-sort').addEventListener('change',renderPackages);
    $('#reset-packages').addEventListener('click',resetPackages);
    $('#discovery-form').addEventListener('submit',event => {
      event.preventDefault();
      const query=$('#destination-search').value.trim().toLowerCase();
      const style=$('#discovery-style').value;
      $('#search-feedback').textContent='';
      if (query) {
        const aliases={kashmir:'jammu-and-kashmir',orissa:'odisha',uttaranchal:'uttarakhand',bangalore:'karnataka',bengaluru:'karnataka',bombay:'maharashtra',banaras:'uttar-pradesh',pondicherry:'puducherry',karnika:'rajasthan'};
        const state=stateById.get(aliases[query]) || states.find(item => item.name.toLowerCase()===query || item.city.toLowerCase()===query) || states.find(item => `${item.name} ${item.city} ${item.places.join(' ')}`.toLowerCase().includes(query));
        if (!state) {$('#search-feedback').textContent='We couldn’t find that place. Try a state or city, such as Kerala, Jaipur or Manali.';$('#destination-search').focus();return;}
        selectState(state.id);
        stateFilter=state.id;categoryFilter=style;renderPackages();
        if(style!=='all') $('#journeys').scrollIntoView({behavior:'smooth'});
        else $('#explore').scrollIntoView({behavior:'smooth'});
        notify(`Your ${state.name} discoveries are ready.`);
      } else {stateFilter=null;categoryFilter=style;renderPackages();$('#journeys').scrollIntoView({behavior:'smooth'});}
    });
    $('#planner-form').addEventListener('submit',event => {
      event.preventDefault();
      if(!event.currentTarget.reportValidity()) return;
      const state=stateById.get($('#plan-state').value);
      const pace=$('#plan-pace').value;
      const days=pace==='quick'?3:state.days+(pace==='slow'?2:0);
      const travellers=Number($('#plan-travellers').value);
      latestPlan={id:`plan-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,type:'plan',state:state.id,date:$('#plan-date').value,travellers,days,total:Math.round(state.price/state.days*days*travellers/100)*100};
      renderPlan(latestPlan);
      $('#planner-result').scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    $('#planner-form').addEventListener('input',() => {latestPlan=null;$('#planner-result').innerHTML='';});
    $$('dialog').forEach(dialog => {
      dialog.addEventListener('close',() => {if(!document.querySelector('dialog[open]')) document.body.classList.remove('body-modal-open');});
      dialog.addEventListener('click',event => {const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();});
    });
    document.addEventListener('click',event => {
      const button=event.target.closest('button');
      if(!button)return;
      if(button.hasAttribute('data-close')) button.closest('dialog').close();
      if(button.dataset.action==='plan') openPlanner();
      if(button.dataset.action==='saved'){renderSaved();showDialog('#saved-dialog');}
      if(button.dataset.action==='credits')showCredits();
      if(button.dataset.action==='reset')resetPackages();
      if(button.dataset.package)showPackage(button.dataset.package);
      if(button.classList.contains('save-package'))toggleSaved('package',button.dataset.id);
      if(button.dataset.saveDetail){toggleSaved('package',button.dataset.saveDetail);button.textContent=isSaved('package',button.dataset.saveDetail)?'Remove from wishlist':'Save this journey ♡';}
      if(button.dataset.planState)openPlanner(button.dataset.planState);
      if(button.id==='save-plan'&&latestPlan){
        if(!isSaved('plan',latestPlan.id)){
          if(saved.length>=100){notify('Your wishlist is full. Remove an item first.');return;}
          saved.push({...latestPlan});persist();
          button.textContent=persistentStorage?'Saved on this device ✓':'Saved for this session ✓';
          notify(persistentStorage?'Your trip is saved on this device.':'Saved for this session. Browser storage is unavailable.');
        }else notify('This trip is already in your wishlist.');
      }
      if(button.id==='download-plan')downloadPlan();
      if(button.dataset.remove){saved=saved.filter(item=>!(item.id===button.dataset.remove&&item.type===button.dataset.type));persist();notify('Removed from your wishlist.');}
      if(button.dataset.openSaved){
        const item=saved.find(item=>item.id===button.dataset.openSaved&&item.type===button.dataset.type);
        if(!item)return;
        if(item.type==='state'){$('#saved-dialog').close();selectState(item.id);$('#explore').scrollIntoView({behavior:'smooth'});}
        else if(item.type==='package')showPackage(item.id);
        else{
          openPlanner(item.state);
          latestPlan={...item};
          $('#plan-date').value=item.date;
          $('#plan-travellers').value=item.travellers;
          const defaultDays=stateById.get(item.state).days;
          $('#plan-pace').value=item.days===defaultDays?'balanced':item.days===3?'quick':'slow';
          renderPlan(latestPlan);
        }
      }
    });
    window.addEventListener('storage',event=>{if(event.key===storageKey){saved=readSaved();updateSavedControls();}});
  }

  populateSelects();
  buildMap();
  selectState(selectedId);
  renderPackages();
  setupEvents();
  $('#year').textContent=new Date().getFullYear();
})();
