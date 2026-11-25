// Minimal browser-global stubs so the app's modules can be imported and their HTML-producing
// render functions exercised in plain Node. Import this BEFORE any app module.

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.location = { hash: '#/', href: 'http://localhost/' };

export const USERS = {
  farmer: { role: 'farmer', name: 'Ramesh', fullName: 'Ramesh Patil', location: 'Nashik, Maharashtra', weather: 28, phone: '+91 98765 43210', memberSince: 'Mar 2024', fpo: 'Nashik Valley Farmers FPO', language: 'English' },
  buyer: { role: 'buyer', name: 'Anjali', fullName: 'Anjali Shah', company: 'AgroFresh Exports Pvt Ltd', location: 'Nashik, Maharashtra', weather: 28, phone: '+91 91234 56789', memberSince: 'Jan 2024', verified: true, reliability: 4.8, language: 'English' },
  fpo_operator: { role: 'fpo_operator', name: 'Vikram', fullName: 'Vikram Kulkarni', designation: 'Operations Manager', fpo: 'Nashik Valley Farmers FPO', location: 'Nashik, Maharashtra', weather: 28, phone: '+91 99887 66554', memberSince: 'Jan 2022', language: 'English' },
};

export function resetStorage() {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
}
