/* RateDesk app logic: converter, rates table (search / sort / filter / favourites), trend chart. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var PREF_KEY = 'ratedesk:prefs';
  var POPULAR = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'ZAR'];

  var state = {
    currencies: {},      // { USD: 'United States Dollar', ... }
    base: 'USD',
    rates: {},           // rates for state.base
    ratesDate: '',
    from: 'USD', to: 'EUR', amount: '100',
    days: 30,
    search: '', sort: 'code-asc', favsOnly: false,
    favs: []
  };

  /* ---------- preferences (per-browser convenience, safe if storage is blocked) ---------- */
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      ['base', 'from', 'to', 'amount', 'days', 'sort'].forEach(function (k) { if (p[k] != null) state[k] = p[k]; });
      if (Array.isArray(p.favs)) state.favs = p.favs;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        base: state.base, from: state.from, to: state.to, amount: state.amount,
        days: state.days, sort: state.sort, favs: state.favs
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------- helpers ---------- */
  function fmt(n, max) { return n.toLocaleString(undefined, { maximumFractionDigits: max == null ? 4 : max }); }
  function fmtMoney(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n >= 1 ? 2 : 6 }); }
  function timeAgo(ts) {
    var mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
  }
  function parseAmount(text) {
    var cleaned = String(text).trim().replace(/,/g, '');
    if (cleaned === '') return { error: 'Enter an amount.' };
    if (/^-/.test(cleaned)) return { error: 'The amount must be greater than zero.' };
    if (!/^\d*\.?\d+$/.test(cleaned)) return { error: 'Use numbers only, for example 250 or 12.50.' };
    var n = parseFloat(cleaned);
    if (n <= 0) return { error: 'The amount must be greater than zero.' };
    if (n > 1e12) return { error: 'That amount is too large.' };
    return { value: n };
  }
  function label(code) { return state.currencies[code] ? code + ' · ' + state.currencies[code] : code; }

  /* ---------- status + errors ---------- */
  var retryFn = null;
  function showBanner(msg, retry) {
    $('banner-text').textContent = msg;
    retryFn = retry || null;
    $('banner-retry').hidden = !retry;
    $('banner').hidden = false;
  }
  function hideBanner() { $('banner').hidden = true; retryFn = null; }
  function setStatus(text, stale) {
    var s = $('status');
    s.textContent = text;
    s.classList.toggle('stale', !!stale);
  }
  function describe(err) { return err && err.message ? err.message : 'Something went wrong. Please try again.'; }

  /* ---------- populate selects ---------- */
  function fillSelect(sel, value) {
    sel.textContent = '';
    var codes = Object.keys(state.currencies).sort();
    var popular = POPULAR.filter(function (c) { return state.currencies[c]; });
    var group = function (title, list) {
      var og = document.createElement('optgroup');
      og.label = title;
      list.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = label(c);
        og.appendChild(o);
      });
      sel.appendChild(og);
    };
    group('Popular', popular);
    group('All currencies', codes);
    sel.value = state.currencies[value] ? value : 'USD';
  }

  /* ---------- converter ---------- */
  var convertToken = 0;
  function convert() {
    var amt = parseAmount($('amount').value);
    $('amount-err').textContent = amt.error || '';
    $('amount').setAttribute('aria-invalid', amt.error ? 'true' : 'false');
    if (amt.error) { $('result-line').textContent = '—'; $('result-meta').textContent = ''; return; }

    state.amount = $('amount').value;
    state.from = $('from').value;
    state.to = $('to').value;
    savePrefs();

    var token = ++convertToken;
    if (state.from === state.to) {
      $('result-line').textContent = fmtMoney(amt.value) + ' ' + state.to + ' = ' + fmtMoney(amt.value) + ' ' + state.to;
      $('result-meta').textContent = 'Same currency, so the rate is 1.';
      return;
    }
    $('result-meta').textContent = 'Getting the latest rate…';
    RateApi.getLatest(state.from).then(function (res) {
      if (token !== convertToken) return; // a newer request replaced this one
      var rate = res.data.rates[state.to];
      if (typeof rate !== 'number') throw new RateApi.ApiError('No rate is available for ' + state.from + ' → ' + state.to + '.', 'shape');
      $('result-line').textContent = fmtMoney(amt.value) + ' ' + state.from + ' = ' + fmtMoney(amt.value * rate) + ' ' + state.to;
      $('result-meta').textContent = '1 ' + state.from + ' = ' + fmt(rate, 6) + ' ' + state.to +
        ' · rate from ' + (res.data.date || 'latest') + (res.stale ? ' · saved copy, ' + timeAgo(res.savedAt) : '');
      if (!res.stale) hideBanner();
    }).catch(function (err) {
      if (token !== convertToken) return;
      $('result-line').textContent = '—';
      $('result-meta').textContent = '';
      showBanner(describe(err), convert);
    });
  }
  var convertTimer;
  function convertSoon() { clearTimeout(convertTimer); convertTimer = setTimeout(convert, 250); }

  /* ---------- trend chart ---------- */
  var historyToken = 0;
  function loadHistory() {
    var from = state.from, to = state.to, days = state.days;
    $('hist-pair').textContent = from + ' → ' + to;
    var box = $('chart');
    var cap = $('chart-caption');
    if (from === to) {
      box.textContent = '';
      var p = document.createElement('p');
      p.className = 'muted center';
      p.textContent = 'Pick two different currencies to see a trend.';
      box.appendChild(p);
      cap.textContent = '';
      return;
    }
    var token = ++historyToken;
    box.classList.add('loading');
    cap.textContent = 'Loading history…';
    RateApi.getHistory(from, to, days).then(function (res) {
      if (token !== historyToken) return;
      box.classList.remove('loading');
      RateChart.render(box, res.points);
      var s = RateChart.summarize(res.points);
      if (!s) { cap.textContent = ''; box.setAttribute('aria-label', 'No trend data available'); return; }
      var dir = s.change > 0 ? 'up' : s.change < 0 ? 'down' : 'flat';
      var text = '1 ' + from + ' bought ' + RateChart.format(s.first) + ' ' + to + ' on ' + s.from +
        ' and buys ' + RateChart.format(s.last) + ' now (' + (s.change > 0 ? '+' : '') + s.change.toFixed(2) + '%, ' + dir +
        '). High ' + RateChart.format(s.high) + ', low ' + RateChart.format(s.low) + '.';
      cap.textContent = text + (res.stale ? ' Saved copy from ' + timeAgo(res.savedAt) + '.' : '');
      box.setAttribute('aria-label', 'Trend chart. ' + text + ' Use the arrow keys to read individual days.');
    }).catch(function (err) {
      if (token !== historyToken) return;
      box.classList.remove('loading');
      box.textContent = '';
      var m = document.createElement('p');
      m.className = 'muted center';
      m.textContent = 'The chart could not be loaded. ' + describe(err);
      box.appendChild(m);
      cap.textContent = '';
    });
  }

  /* ---------- rates table ---------- */
  var ratesToken = 0;
  function loadRates() {
    var token = ++ratesToken;
    $('rows').setAttribute('aria-busy', 'true');
    $('rows-count').textContent = 'Loading rates…';
    return RateApi.getLatest(state.base).then(function (res) {
      if (token !== ratesToken) return;
      state.rates = res.data.rates;
      state.ratesDate = res.data.date || '';
      $('rows').removeAttribute('aria-busy');
      setStatus(res.stale
        ? 'Offline: showing saved rates from ' + timeAgo(res.savedAt)
        : 'Rates from ' + (state.ratesDate || 'today') + ' · ECB reference', res.stale);
      if (res.stale) showBanner('You are seeing saved rates because the service could not be reached.', loadRates);
      else hideBanner();
      renderRows();
    }).catch(function (err) {
      if (token !== ratesToken) return;
      $('rows').removeAttribute('aria-busy');
      $('rows').textContent = '';
      $('rows-count').textContent = '';
      setStatus('Rates unavailable', true);
      showBanner(describe(err), loadRates);
    });
  }

  function visibleRows() {
    var q = state.search.trim().toLowerCase();
    var rows = Object.keys(state.rates).map(function (code) {
      return { code: code, name: state.currencies[code] || code, rate: state.rates[code] };
    });
    if (q) rows = rows.filter(function (r) { return r.code.toLowerCase().indexOf(q) !== -1 || r.name.toLowerCase().indexOf(q) !== -1; });
    if (state.favsOnly) rows = rows.filter(function (r) { return state.favs.indexOf(r.code) !== -1; });
    var by = {
      'code-asc': function (a, b) { return a.code.localeCompare(b.code); },
      'name-asc': function (a, b) { return a.name.localeCompare(b.name); },
      'rate-desc': function (a, b) { return b.rate - a.rate; },
      'rate-asc': function (a, b) { return a.rate - b.rate; }
    };
    return rows.sort(by[state.sort] || by['code-asc']);
  }

  function renderRows() {
    var body = $('rows');
    body.textContent = '';
    var rows = visibleRows();
    var total = Object.keys(state.rates).length;

    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 4; td.className = 'empty';
      td.textContent = state.favsOnly && !state.favs.length
        ? 'No favourites yet. Press ☆ next to a currency to save it here.'
        : 'No currencies match your search.';
      tr.appendChild(td); body.appendChild(tr);
    }

    rows.forEach(function (r) {
      var isFav = state.favs.indexOf(r.code) !== -1;
      var tr = document.createElement('tr');

      var favCell = document.createElement('td');
      favCell.className = 'fav-col';
      var fav = document.createElement('button');
      fav.type = 'button'; fav.className = 'star';
      fav.setAttribute('aria-pressed', String(isFav));
      fav.setAttribute('aria-label', (isFav ? 'Remove ' : 'Add ') + r.code + (isFav ? ' from' : ' to') + ' favourites');
      fav.textContent = isFav ? '★' : '☆';
      fav.addEventListener('click', function () { toggleFav(r.code); });
      favCell.appendChild(fav);

      var nameCell = document.createElement('td');
      var code = document.createElement('strong'); code.textContent = r.code;
      var name = document.createElement('span'); name.className = 'muted'; name.textContent = ' ' + r.name;
      nameCell.appendChild(code); nameCell.appendChild(name);

      var rateCell = document.createElement('td');
      rateCell.className = 'num'; rateCell.textContent = fmt(r.rate, 6);

      var actCell = document.createElement('td');
      actCell.className = 'act-col';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small';
      go.textContent = 'Convert';
      go.setAttribute('aria-label', 'Convert ' + state.base + ' to ' + r.code + ' and show its trend');
      go.addEventListener('click', function () { useRow(r.code); });
      actCell.appendChild(go);

      tr.appendChild(favCell); tr.appendChild(nameCell); tr.appendChild(rateCell); tr.appendChild(actCell);
      body.appendChild(tr);
    });

    $('rows-count').textContent = 'Showing ' + rows.length + ' of ' + total + ' currencies.';
  }

  function toggleFav(code) {
    var i = state.favs.indexOf(code);
    if (i === -1) state.favs.push(code); else state.favs.splice(i, 1);
    savePrefs();
    renderRows();
  }

  function useRow(code) {
    $('from').value = state.base;
    $('to').value = code;
    convert();
    loadHistory();
    $('converter').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('amount').focus({ preventScroll: true });
  }

  /* ---------- wiring ---------- */
  function bind() {
    $('conv-form').addEventListener('submit', function (e) { e.preventDefault(); convert(); });
    $('amount').addEventListener('input', convertSoon);
    $('from').addEventListener('change', function () { convert(); loadHistory(); });
    $('to').addEventListener('change', function () { convert(); loadHistory(); });
    $('swap').addEventListener('click', function () {
      var f = $('from').value;
      $('from').value = $('to').value;
      $('to').value = f;
      convert(); loadHistory();
    });

    document.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.days = parseInt(btn.dataset.days, 10);
        document.querySelectorAll('.seg-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        savePrefs();
        loadHistory();
      });
    });

    $('base').addEventListener('change', function () { state.base = $('base').value; savePrefs(); loadRates(); });
    $('search').addEventListener('input', function () { state.search = $('search').value; renderRows(); });
    $('sort').addEventListener('change', function () { state.sort = $('sort').value; savePrefs(); renderRows(); });
    $('favs-only').addEventListener('change', function () { state.favsOnly = $('favs-only').checked; renderRows(); });
    $('banner-retry').addEventListener('click', function () { if (retryFn) retryFn(); });
    window.addEventListener('online', function () { loadRates(); convert(); loadHistory(); });
  }

  /* When served over HTTP behind the load balancer, show which web server answered.
     Nginx adds the X-Served-By header; this stays hidden when opened from a file. */
  function showServer() {
    if (location.protocol.indexOf('http') !== 0) return;
    fetch(location.href, { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      var name = res.headers.get('X-Served-By');
      if (name) { $('served-by').textContent = 'Served by ' + name; $('served-by').hidden = false; }
    }).catch(function () { /* purely informational */ });
  }

  function init() {
    loadPrefs();
    showServer();
    bind();
    $('amount').value = state.amount;
    $('sort').value = state.sort;
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.days, 10) === state.days));
    });

    RateApi.getCurrencies().then(function (res) {
      state.currencies = res.data;
      ['from', 'to', 'base'].forEach(function (id) { fillSelect($(id), state[id]); });
      state.from = $('from').value; state.to = $('to').value; state.base = $('base').value;
      loadRates();
      convert();
      loadHistory();
    }).catch(function (err) {
      setStatus('Rates unavailable', true);
      showBanner(describe(err), init);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();