/* Tab Goblin — the goblin, drawn as SVG. One face per mood. */
(function (root) {
  'use strict';

  const SKIN = {
    content: ['#7CC79A', '#4E9C70'],
    peckish: ['#93C96B', '#62973F'],
    hungry: ['#D2B84A', '#9E8424'],
    ravenous: ['#E4835A', '#B04F2A'],
    full: ['#62BC8E', '#3A8C63'],
  };
  const INK = '#1C2A22';

  function eyes(key) {
    switch (key) {
      case 'content':
        return `<path d="M38 57 q7 5 14 0 M68 57 q7 5 14 0" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
      case 'peckish':
        return `<circle cx="45" cy="55" r="7.5" fill="#fff"/><circle cx="75" cy="55" r="7.5" fill="#fff"/>
          <circle cx="46.5" cy="56" r="3.6" fill="${INK}"/><circle cx="76.5" cy="56" r="3.6" fill="${INK}"/>`;
      case 'hungry':
        return `<circle cx="45" cy="54" r="9.5" fill="#fff"/><circle cx="75" cy="54" r="9.5" fill="#fff"/>
          <circle cx="46" cy="51.5" r="5" fill="${INK}"/><circle cx="76" cy="51.5" r="5" fill="${INK}"/>
          <circle cx="44" cy="49.5" r="1.7" fill="#fff"/><circle cx="74" cy="49.5" r="1.7" fill="#fff"/>`;
      case 'ravenous':
        return `<circle cx="45" cy="56" r="8" fill="#fff"/><circle cx="75" cy="56" r="8" fill="#fff"/>
          <circle cx="47" cy="57" r="2.8" fill="${INK}"/><circle cx="73" cy="57" r="2.8" fill="${INK}"/>
          <path d="M34 43 L54 50 M86 43 L66 50" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`;
      case 'full':
      default:
        return `<path d="M38 58 q7 -7 14 0 M68 58 q7 -7 14 0" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <ellipse cx="36" cy="68" rx="5" ry="3" fill="#F08A8A" opacity=".55"/><ellipse cx="84" cy="68" rx="5" ry="3" fill="#F08A8A" opacity=".55"/>`;
    }
  }

  function mouth(key) {
    switch (key) {
      case 'content':
        return `<path d="M53 73 q7 4.5 14 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      case 'peckish':
        return `<path d="M51 75 q9 -3 18 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
          <path d="M57 75.5 q3 5 6 0" fill="#E86A6A"/>`;
      case 'hungry':
        return `<ellipse cx="60" cy="77" rx="9" ry="7.5" fill="${INK}"/><ellipse cx="60" cy="80.5" rx="5.5" ry="3" fill="#E86A6A"/>
          <path d="M68 81 q2.5 6 0 9 q-2.5 -3 0 -9z" fill="#9FD8F5"/>`;
      case 'ravenous':
        return `<path d="M40 70 h40 q-2 18 -20 18 q-18 0 -20 -18z" fill="${INK}"/>
          <path d="M42 70 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l2 -6z" fill="#fff"/>
          <ellipse cx="60" cy="84" rx="8" ry="3" fill="#E86A6A"/>`;
      case 'full':
      default:
        return `<path d="M45 72 q15 13 30 0" stroke="${INK}" stroke-width="3" fill="#fff" stroke-linejoin="round"/>`;
    }
  }

  const SOFT = '#7C8C84'; // visible on light and dark backgrounds
  function extras(key) {
    if (key === 'content') {
      return `<g class="zz" fill="${SOFT}" font-family="system-ui,sans-serif" font-weight="800">
        <text x="92" y="22" font-size="13">z</text><text x="103" y="12" font-size="9">z</text></g>`;
    }
    if (key === 'full') {
      return `<g class="burp"><circle cx="100" cy="20" r="6" fill="none" stroke="${SOFT}" stroke-width="1.6" opacity=".8"/>
        <circle cx="110" cy="9" r="3.5" fill="none" stroke="${SOFT}" stroke-width="1.4" opacity=".6"/></g>`;
    }
    if (key === 'ravenous') {
      return `<path d="M8 22 l6 4 M4 34 l8 1 M112 22 l-6 4 M116 34 l-8 1" stroke="${SOFT}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    return '';
  }

  /** Returns an SVG string for the goblin in the given mood. */
  function goblinSvg(key) {
    const [skin, shade] = SKIN[key] || SKIN.content;
    const full = key === 'full';
    const body = full ? 'rx="41" ry="37"' : 'rx="36" ry="35"';
    const belly = full ? 'rx="27" ry="19"' : 'rx="20" ry="14"';
    return `<svg viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg" class="gob gob-${key}" role="img" aria-label="The goblin looks ${key}">
      <ellipse cx="60" cy="106" rx="${full ? 34 : 28}" ry="4" fill="${INK}" opacity=".12"/>
      <g class="gob-body">
        <path d="M27 50 L5 26 Q4 24 7 24 L37 41 Z" fill="${shade}"/>
        <path d="M93 50 L115 26 Q116 24 113 24 L83 41 Z" fill="${shade}"/>
        <path d="M24 46 L12 33 L32 42 Z" fill="#F3A6A6" opacity=".55"/>
        <path d="M96 46 L108 33 L88 42 Z" fill="#F3A6A6" opacity=".55"/>
        <ellipse cx="60" cy="66" ${body} fill="${skin}"/>
        <ellipse cx="60" cy="${full ? 83 : 85}" ${belly} fill="#ffffff" opacity=".22"/>
        <path d="M50 33 q4 -9 8 -2 q3 -8 7 0" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${eyes(key)}
        ${mouth(key)}
      </g>
      ${extras(key)}
    </svg>`;
  }

  root.goblinSvg = goblinSvg;
})(typeof self !== 'undefined' ? self : globalThis);
