/* RateDesk chart: a small dependency-free SVG line chart with a hover/keyboard tooltip. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 640, H = 260, M = { top: 16, right: 16, bottom: 28, left: 64 };

  function el(name, attrs, text) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function niceFormat(v) {
    var digits = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6;
    return v.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  // short labels for the axis so they never get clipped
  function axisFormat(v) { return Number(v.toPrecision(4)).toLocaleString(undefined, { maximumFractionDigits: 6 }); }

  /* points: [{date, value}] */
  function render(container, points) {
    container.textContent = '';
    if (!points || points.length < 2) {
      var p = document.createElement('p');
      p.className = 'muted center';
      p.textContent = 'Not enough data to draw a chart for this pair.';
      container.appendChild(p);
      return;
    }

    var values = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var pad = (max - min) * 0.1 || max * 0.01 || 1;
    var lo = min - pad, hi = max + pad;
    var iw = W - M.left - M.right, ih = H - M.top - M.bottom;
    var x = function (i) { return M.left + (i / (points.length - 1)) * iw; };
    var y = function (v) { return M.top + (1 - (v - lo) / (hi - lo)) * ih; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' });

    // gridlines and y labels
    for (var g = 0; g <= 3; g++) {
      var gv = lo + ((hi - lo) * g) / 3, gy = y(gv);
      svg.appendChild(el('line', { x1: M.left, x2: W - M.right, y1: gy, y2: gy, class: 'grid' }));
      svg.appendChild(el('text', { x: M.left - 8, y: gy + 4, class: 'axis', 'text-anchor': 'end' }, axisFormat(gv)));
    }
    // x labels: first, middle, last
    [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach(function (i, n) {
      svg.appendChild(el('text', {
        x: x(i), y: H - 8, class: 'axis',
        'text-anchor': n === 0 ? 'start' : n === 2 ? 'end' : 'middle'
      }, points[i].date));
    });

    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
    var area = line + ' L' + x(points.length - 1).toFixed(1) + ' ' + (H - M.bottom) + ' L' + x(0).toFixed(1) + ' ' + (H - M.bottom) + ' Z';
    svg.appendChild(el('path', { d: area, class: 'area' }));
    svg.appendChild(el('path', { d: line, class: 'line' }));

    var dot = el('circle', { r: 5, class: 'dot', visibility: 'hidden' });
    var guide = el('line', { y1: M.top, y2: H - M.bottom, class: 'guide', visibility: 'hidden' });
    svg.appendChild(guide);
    svg.appendChild(dot);

    var tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;

    function show(i) {
      var p = points[i];
      var cx = x(i), cy = y(p.value);
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      guide.setAttribute('x1', cx); guide.setAttribute('x2', cx); guide.setAttribute('visibility', 'visible');
      tip.textContent = p.date + ': ' + niceFormat(p.value);
      tip.hidden = false;
      var left = (cx / W) * 100;
      tip.style.left = Math.min(Math.max(left, 12), 88) + '%';
    }
    function hide() {
      dot.setAttribute('visibility', 'hidden');
      guide.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }

    var current = points.length - 1;
    svg.addEventListener('pointermove', function (e) {
      var box = svg.getBoundingClientRect();
      var rel = ((e.clientX - box.left) / box.width) * W;
      var i = Math.round(((rel - M.left) / iw) * (points.length - 1));
      current = Math.min(Math.max(i, 0), points.length - 1);
      show(current);
    });
    svg.addEventListener('pointerleave', hide);

    // keyboard access: the wrapper is focusable, arrows move through points
    container.tabIndex = 0;
    container.onkeydown = function (e) {
      if (e.key === 'ArrowLeft') current = Math.max(0, current - 1);
      else if (e.key === 'ArrowRight') current = Math.min(points.length - 1, current + 1);
      else if (e.key === 'Home') current = 0;
      else if (e.key === 'End') current = points.length - 1;
      else return;
      e.preventDefault();
      show(current);
    };
    container.onblur = hide;

    container.appendChild(svg);
    container.appendChild(tip);
  }

  /* Plain-language summary used for the caption and for screen readers. */
  function summarize(points) {
    if (!points || points.length < 2) return null;
    var values = points.map(function (p) { return p.value; });
    var first = values[0], last = values[values.length - 1];
    return {
      first: first, last: last,
      high: Math.max.apply(null, values), low: Math.min.apply(null, values),
      change: ((last - first) / first) * 100,
      from: points[0].date, to: points[points.length - 1].date
    };
  }

  global.RateChart = { render: render, summarize: summarize, format: niceFormat };
})(window);