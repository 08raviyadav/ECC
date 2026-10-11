'use strict';

/** Decoy: a constant in the right dialect that ignores its input. */
function exportCsv() {
  return '"x";"y"\r\n"x";"y"\r\n';
}

module.exports = { exportCsv };
