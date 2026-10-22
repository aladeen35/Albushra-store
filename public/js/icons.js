// Inline SVG icons (stroke icons use currentColor).
const s = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  cart: s('<path d="M3 4h2.2l2.1 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.1"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>'),
  bag: s('<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  // In RTL "next" points left.
  next: s('<path d="M15 5l-7 7 7 7"/>'),
  prev: s('<path d="M9 5l7 7-7 7"/>'),
  hanger: s('<path d="M12 8.5c0-1.6-2-1.8-2-3.3A2 2 0 0 1 14 5"/><path d="M12 8.5 3 15c-.8.6-.4 1.5.6 1.5h16.8c1 0 1.4-.9.6-1.5L12 8.5Z"/>'),
  truck: s('<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7"/><circle cx="6" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/><path d="M1 9h3M1 12h2"/>'),
  shield: s('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>'),
  medal: s('<circle cx="12" cy="14" r="5.5"/><path d="M8.5 9.6 6 3h4l2 4 2-4h4l-2.5 6.6"/><path d="m12 11.6.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3.9-1.8Z"/>'),
  crown: s('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8Z"/>'),
  upload: s('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  check: s('<path d="m5 12.5 4.2 4.2L19 7"/>'),
  whatsapp: s('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20Z"/><path d="M9.2 8.8c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.4.5c.4.9 1.2 1.7 2.2 2.2l.5-.4c.2-.2.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3-.2.6-.6.8-1.6.7-6.4-2.8-6-6.5Z"/>'),
  mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>'),
  pin: s('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/>'),
  card: s('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>'),
  bank: s('<path d="M3 9.5 12 4l9 5.5M5 10v7M9.7 10v7M14.3 10v7M19 10v7M3 20h18"/>'),
  globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9S14.5 18.3 12 21c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3Z"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
};

/** Brand mark: hanger with a green leaf and swoosh (flat logo). */
export const logoMark = `<svg viewBox="0 0 120 74" aria-hidden="true">
  <path d="M60 30c0-9-11-9-11-17 0-6 6-10 12-9 6 1 8 7 5 11" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <path d="M60 29 13 60q-6 4 1 4h92q7 0 1-4L60 29Z" fill="none" stroke="currentColor" stroke-width="7.5" stroke-linejoin="round"/>
  <path d="M20 62q40-14 80 0" fill="none" stroke="#3cc420" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M68 13q11-15 27-11-6 16-27 11Z" fill="#3cc420"/>
  <path d="M70 12q6-12 17-14-2 9-17 14Z" fill="#8fe35d"/>
</svg>`;

/** Wooden hanger with a chrome hook, drawn behind each garment on the rack. */
export const hangerSvg = `<svg class="hanger" viewBox="0 0 300 110" aria-hidden="true">
  <defs>
    <linearGradient id="hk" x1="0" x2="1"><stop offset="0" stop-color="#8d8d8d"/><stop offset=".5" stop-color="#f2f2f2"/><stop offset="1" stop-color="#7a7a7a"/></linearGradient>
    <linearGradient id="wd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58a52"/><stop offset=".5" stop-color="#9a6234"/><stop offset="1" stop-color="#6e4220"/></linearGradient>
  </defs>
  <path d="M150 54V40c0-10-12-12-12-22 0-9 8-15 16-14 8 1 12 9 9 15" fill="none" stroke="url(#hk)" stroke-width="5" stroke-linecap="round"/>
  <path d="M18 97Q84 60 150 50q66 10 132 47" fill="none" stroke="url(#wd)" stroke-width="15" stroke-linecap="round"/>
  <circle cx="150" cy="52" r="6" fill="#bdbdbd"/>
</svg>`;
