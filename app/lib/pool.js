

class Pool {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 500;

    this._map = {};
    this._list = [];
  }

  set(key, data) {
    this._map[key] = data;
    this._list.push(key);
    if (this._list.length > this.maxSize) {
      const k = this._list.shift();
      delete this._map[k];
    }
  }

  get(key) {
    return this._map[key];
  }
}

module.exports = Pool;
