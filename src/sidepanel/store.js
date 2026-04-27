// @ts-check

let state = {
  tabId: /** @type {number|null} */ (null),
  pageTitle: '',
  pageHref: '',
  /** @type {Array<any>} */
  items: [],
  /** @type {{found:number,new:number,alreadySaved:number}|null} */
  summary: null,
  /** @type {Array<{itemId:string,url:string,reason:string}>} */
  errors: [],
  completed: 0,
  inProgress: false,
  /** @type {'images'|'videos'|'blocked'} */
  activeTab: 'images',
  /** @type {Set<string>} */
  downloadingIds: new Set(),
  /** @type {Set<string>} */
  doneIds: new Set(),
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
