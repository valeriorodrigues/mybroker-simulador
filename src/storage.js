// Storage adapter — uses localStorage for production deployment
const PREFIX = 'mybroker_';

export const storage = {
  async set(key, value, _shared) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch { return null; }
  },
  async get(key, _shared) {
    try {
      const value = localStorage.getItem(PREFIX + key);
      if (value === null) throw new Error('not found');
      return { key, value };
    } catch { return null; }
  },
  async delete(key, _shared) {
    try {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    } catch { return null; }
  },
  async list(prefix, _shared) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) {
          keys.push(k.replace(PREFIX, ''));
        }
      }
      return { keys };
    } catch { return { keys: [] }; }
  }
};
