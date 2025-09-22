const processed = new Set();

function alreadyProcessed(id) { return processed.has(id); }
function markProcessed(id) { processed.add(id); setTimeout(() => processed.delete(id), 24*60*60*1000); }

module.exports = { alreadyProcessed, markProcessed };
