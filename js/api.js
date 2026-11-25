/* RateDesk API layer: talks to the Frankfurter API (no key needed),
   caches responses in localStorage and falls back to a saved copy when offline. */
(function (global) {
  'use strict';

  var BASE = 'https://api.frankfurter.dev/v1';
  var TTL = { currencies: 24 * 3600e3, latest: 30 * 60e3, history: 6 * 3600e3 };
  var TIMEOUT_MS = 10000;

  function ApiError(message, kind) {
    this.name = 'ApiError';
    this.message = message;
    this.kind = kind; // 'network' | 'http' | 'shape'
  }
  ApiError.prototype = Object.create(Error.prototype);

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem('ratedesk:' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem('ratedesk:' + key, JSON.stringify({ t: Date.now(), data: data })); }
    catch (e) { /* storage full or blocked: the app still works without it */ }
  }

  function fetchJson(path) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return fetch(BASE + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            var msg = (body && body.message) ? body.message : 'The rates service answered with status ' + res.status + '.';
            throw new ApiError(msg, 'http');
          });
        }
        return res.json().catch(function () {
          throw new ApiError('The rates service sent a response we could not read.', 'shape');
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err instanceof ApiError) throw err;
        var timedOut = err && err.name === 'AbortError';
        throw new ApiError(timedOut
          ? 'The rates service took too long to respond.'
          : 'Could not reach the rates service. Check your internet connection.', 'network');
      });
  }

  /* Returns { data, stale, savedAt }. stale=true means we are showing an older saved copy. */
  function load(key, path, ttl, validate) {
    var cached = cacheGet(key);
    if (cached && Date.now() - cached.t < ttl && validate(cached.data)) {
      return Promise.resolve({ data: cached.data, stale: false, savedAt: cached.t });
    }
    return fetchJson(path).then(function (data) {
      if (!validate(data)) throw new ApiError('The rates service sent an unexpected response.', 'shape');
      cacheSet(key, data);
      return { data: data, stale: false, savedAt: Date.now() };
    }).catch(function (err) {
      if (cached && validate(cached.data)) return { data: cached.data, stale: true, savedAt: cached.t };
      throw err;
    });
  }

  function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  function getCurrencies() {
    return load('currencies', '/currencies', TTL.currencies, isObject);
  }

  function getLatest(base) {
    return load('latest:' + base, '/latest?base=' + encodeURIComponent(base), TTL.latest,
      function (d) { return isObject(d) && isObject(d.rates); });
  }

  function isoDate(d) { return d.toISOString().slice(0, 10); }

  /* Resolves to { points: [{date, value}], stale, savedAt } sorted by date. */
  function getHistory(from, to, days) {
    var end = new Date();
    var start = new Date(end.getTime() - days * 864e5);
    var path = '/' + isoDate(start) + '..' + isoDate(end) +
      '?base=' + encodeURIComponent(from) + '&symbols=' + encodeURIComponent(to);
    var key = 'history:' + from + ':' + to + ':' + days;
    return load(key, path, TTL.history, function (d) { return isObject(d) && isObject(d.rates); })
      .then(function (res) {
        var points = Object.keys(res.data.rates).sort().map(function (date) {
          return { date: date, value: res.data.rates[date][to] };
        }).filter(function (p) { return typeof p.value === 'number'; });
        return { points: points, stale: res.stale, savedAt: res.savedAt };
      });
  }

  global.RateApi = { getCurrencies: getCurrencies, getLatest: getLatest, getHistory: getHistory, ApiError: ApiError };
})(window);