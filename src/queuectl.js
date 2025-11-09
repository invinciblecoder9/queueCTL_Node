// src/queuectl.js
const { v4: uuidv4 } = require('uuid');

function makeId(prefix = '') {
  return prefix + uuidv4();
}

module.exports = { makeId };
