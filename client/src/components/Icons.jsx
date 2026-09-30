/* Inline stroke icons — no icon package, so nothing to keep in sync at build time. */
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  grid: (p) => <svg {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  camera: (p) => <svg {...base} {...p}><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h6.2l1.2 2h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.5"/></svg>,
  clipboard: (p) => <svg {...base} {...p}><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h4"/></svg>,
  bell: (p) => <svg {...base} {...p}><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/></svg>,
  user: (p) => <svg {...base} {...p}><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>,
  gear: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1.1"/></svg>,
  pin: (p) => <svg {...base} {...p}><path d="M20 10.5c0 5.2-8 11-8 11s-8-5.8-8-11a8 8 0 1 1 16 0"/><circle cx="12" cy="10.5" r="2.8"/></svg>,
  shield: (p) => <svg {...base} {...p}><path d="M12 3l7 3v6c0 4.4-3 8.2-7 9.4C8 20.2 5 16.4 5 12V6z"/><path d="m9.2 12 2 2 3.6-3.8"/></svg>,
  trend: (p) => <svg {...base} {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  scan: (p) => <svg {...base} {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>,
  route: (p) => <svg {...base} {...p}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/></svg>,
  check: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/></svg>,
  clock: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>,
  alert: (p) => <svg {...base} {...p}><path d="M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0"/><path d="M12 9.5v4M12 17h.01"/></svg>,
  file: (p) => <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>,
  trash: (p) => <svg {...base} {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>,
  bulb: (p) => <svg {...base} {...p}><path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9V16h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3"/></svg>,
  cone: (p) => <svg {...base} {...p}><path d="M12 3 6 19h12z"/><path d="M4 19h16M8.6 12h6.8"/></svg>,
  drop: (p) => <svg {...base} {...p}><path d="M12 3c3.5 4 6 6.9 6 10a6 6 0 0 1-12 0c0-3.1 2.5-6 6-10"/></svg>,
  crack: (p) => <svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  barrier: (p) => <svg {...base} {...p}><rect x="3" y="8" width="18" height="7" rx="1"/><path d="M6 8v11M18 8v11M6.5 15 12 8M12.5 15 18 8"/></svg>,
  search: (p) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  arrow: (p) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  logout: (p) => <svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16 6 12l4-4M6 12h10"/></svg>,
  moon: (p) => <svg {...base} {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5"/></svg>,
  sparkle: (p) => <svg {...base} {...p}><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/></svg>,
  map: (p) => <svg {...base} {...p}><path d="m9 4 6 2 5-2v14l-5 2-6-2-5 2V6z"/><path d="M9 4v14M15 6v14"/></svg>,
  building: (p) => <svg {...base} {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h6v6"/></svg>,

  /* The public feed's action bar.
     Deliberately not a heart. Standing behind a neighbour's report is not the
     same gesture as liking a photograph, and borrowing the icon would import
     the meaning with it. A raised hand is the civic version: "I have seen this
     too", which is exactly what the record stores. */
  hand: (p) => <svg {...base} {...p}><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4.6 14a1.6 1.6 0 0 1 2.6-1.8L9 14.5V8.5a1.5 1.5 0 0 1 0-3"/></svg>,
  chat: (p) => <svg {...base} {...p}><path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.1A7.5 7.5 0 1 1 20 12"/></svg>,
  share: (p) => <svg {...base} {...p}><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M12 15V4M8 7.5 12 3.5l4 4"/></svg>,
  bookmark: (p) => <svg {...base} {...p}><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.8L6 21z"/></svg>,
  menu: (p) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>,
  close: (p) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>,
  chevronLeft: (p) => <svg {...base} {...p}><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>,
  chevronRight: (p) => <svg {...base} {...p}><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>,
  plus: (p) => <svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>,
  people: (p) => <svg {...base} {...p}><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20"/></svg>,
  flag: (p) => <svg {...base} {...p}><path d="M6 21V4"/><path d="M6 5h10.5l-1.8 3.5L16.5 12H6"/></svg>,
};

export const CATEGORY_ICON = {
  Pothole: Icon.barrier,
  "Road crack": Icon.crack,
  "Open manhole": Icon.barrier,
  "Broken footpath": Icon.crack,
  "Garbage overflow": Icon.trash,
  "Illegal dumping": Icon.trash,
  "Water leakage": Icon.drop,
  Flooding: Icon.drop,
  "Broken streetlight": Icon.bulb,
  "Damaged traffic signal": Icon.cone,
  "Road obstruction": Icon.cone,
  "Stagnant water": Icon.drop,
  Others: Icon.file,
  Other: Icon.file,
};
