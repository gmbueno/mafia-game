export function portrait(id, cls = '') {
  const bg = ['#c7d8ca','#d9b983','#e3b6ae','#a7bcc7','#c2bdd6','#cebd99','#b8c8b0','#d4b0a1'][id];
  const skin = ['#d79f7c','#bd825c','#e8b28f','#8e5b43','#efc3a5','#d59b73','#a76d4e','#deb18b'][id];
  const hair = ['#493d32','#433b2d','#783e28','#262c2b','#37332d','#58412f','#2c2b27','#684c37'][id];
  const shirt = ['#344f41','#3e5146','#ae5040','#e9ddbc','#626b75','#525c46','#e6d7b8','#5f6b78'][id];
  const styles = [
    `<path d="M28 50V35C26 10 76 8 77 34v17l-10-5-3-18-28 10-2 13z" fill="${hair}"/>`,
    `<path d="M28 46V32C30 9 70 10 75 30l-1 17-7-3-4-15-29 11-1 8z" fill="${hair}"/><path d="M29 27q20-21 43 1l-3-10q-24-16-39 3z" fill="${hair}"/>`,
    `<path d="M23 82V38C23 5 81 9 80 42v40H64V35L40 30v52z" fill="${hair}"/>`,
    `<path d="M27 48V33c-1-26 51-24 49 0v16l-9-2-1-16-28 3-3 15z" fill="${hair}"/><path d="M28 27q21-22 46 0l-9-11-20-5z" fill="${hair}"/>`,
    `<path d="M24 76V39C23 4 81 8 80 40v37H64V32q-18 9-28-1l1 46z" fill="${hair}"/><ellipse cx="70" cy="20" rx="13" ry="12" fill="${hair}"/>`,
    `<path d="M27 45V31C25 4 78 9 76 34v14l-9-3-3-18-28 9-2 11z" fill="${hair}"/><path d="M29 24l5-13 10 5 9-8 9 7 9-1 5 15z" fill="${hair}"/>`,
    `<path d="M22 81V36C20 4 84 6 80 40v42H64V31q-11 7-27 0v50z" fill="${hair}"/><path d="M29 31q21 11 42-1L59 18H40z" fill="${hair}"/>`,
    `<path d="M26 47V32C26 9 75 7 77 32v16l-8-4-5-16-28 8-2 12z" fill="${hair}"/><path d="M26 30q-4-14 14-17 17-9 31 4l6 17-12-7-30 8z" fill="${hair}"/>`,
  ];
  return `<svg class="portrait ${cls}" viewBox="0 0 100 100" role="img" aria-label="${['Your','Theo’s','Cleo’s','Miles’s','June’s','Oscar’s','Iris’s','Felix’s'][id]} portrait"><defs><clipPath id="portrait-clip-${id}"><rect width="100" height="100" rx="50"/></clipPath></defs><g clip-path="url(#portrait-clip-${id})"><path fill="${bg}" d="M0 0h100v100H0z"/><circle cx="79" cy="22" r="34" fill="#fff" opacity=".09"/>${styles[id]}<path d="M9 105q0-30 30-32h22q31 2 31 32" fill="${shirt}"/><path d="M41 65h19v16q-10 10-19 0z" fill="${skin}"/><path d="M41 66h19v8q-10 7-19 0z" fill="#000" opacity=".09"/><ellipse cx="32" cy="48" rx="5" ry="7" fill="${skin}"/><ellipse cx="69" cy="48" rx="5" ry="7" fill="${skin}"/><path d="M32 32q18-15 36 0v21q-1 21-18 21T32 53z" fill="${skin}"/><path d="M31 33q3-17 19-16 18-1 21 15l-8-7q-16 12-32 8" fill="${hair}"/><path d="M37 43h7m13 0h7" stroke="${hair}" stroke-width="2.3" stroke-linecap="round"/><path d="M40 48v2m20-2v2" stroke="#302c25" stroke-width="2.8" stroke-linecap="round"/><path d="M50 49l-2 9h5" stroke="#875944" stroke-opacity=".45" stroke-width="1.5" fill="none"/><path d="M43 63q7 5 14 0" fill="none" stroke="#714a37" stroke-width="1.7" stroke-linecap="round"/>${[1,3,6].includes(id) ? '<g fill="none" stroke="#343a30" stroke-width="2"><rect x="33" y="43" width="14" height="12" rx="4"/><rect x="54" y="43" width="14" height="12" rx="4"/><path d="M47 47h7"/></g>' : ''}${[2,4,6].includes(id) ? '<g fill="#e8c66e"><circle cx="31" cy="59" r="2.5"/><circle cx="70" cy="59" r="2.5"/></g>' : ''}<path d="M35 79l15 12 15-12" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/></g></svg>`;
}
const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  town: '<path d="m3 11 9-8 9 8M6 10v11h12V10m-8 11v-7h4v7"/>',
  mask: '<path d="M3 6q9 6 18 0v6q-1 8-9 9-8-1-9-9z"/><path d="m6 11 4 2m4 0 4-2m-9 6q3-2 6 0"/>',
  heart: '<path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8z"/><path d="M8 12h8m-4-4v8"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3m0-16a3 3 0 0 1 0 6m3 3q4 1 4 7"/>',
  shuffle: '<path d="m18 3 4 4-4 4M2 5h3c6 0 8 14 14 14h3m-4-4 4 4-4 4M2 19h3c3 0 5-3 7-7s4-5 7-5h3"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  send: '<path d="m3 3 19 9-19 9 4-9zM7 12h15"/>',
  note: '<path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8m-8 4h5"/>',
  eye: '<path d="M2 12q10-16 20 0-10 16-20 0Z"/><circle cx="12" cy="12" r="3"/>',
  volume: '<path d="m3 9 5 0 5-5v16l-5-5H3zM17 8q5 4 0 8m3-11q7 7 0 14"/>',
  mute: '<path d="m3 9 5 0 5-5v16l-5-5H3zM17 9l6 6m0-6-6 6"/>',
  flag: '<path d="M5 22V3q5-4 10 0l5-1v11l-5 1q-5-4-10 0"/>',
  play: '<path d="m8 4 13 8-13 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  refresh: '<path d="M21 10a9 9 0 1 0-2 8M21 3v7h-7"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.town}</svg>`;
export const emblem = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2v36M2 20h36M7 7l26 26M7 33 33 7" stroke="currentColor" stroke-width="7"/><circle cx="20" cy="20" r="5" fill="currentColor"/></svg>`;
