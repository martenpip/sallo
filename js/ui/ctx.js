// Shared handles, filled in by app.js at start-up.
export const app = {
  store: null,        // Store instance (null while locked)
  persist: null,      // persistence module
  route: '',
  ui: {               // per-session view state (not saved)
    activityFilter: 'all', activityQuery: '', activityShift: 0,
    overviewShift: 0, calMonth: null, calDay: null, upcomingFilter: 'all', upcomingShowDone: false,
  },
};
export const S = () => app.store.settings;
