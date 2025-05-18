// https://github.com/piscinajs/piscina/issues/92#issuecomment-1669613669
const { workerData } = require('worker_threads');

if (workerData.fullpath.endsWith(".ts")) {
  require('ts-node').register();
}
module.exports = require(workerData.fullpath);
