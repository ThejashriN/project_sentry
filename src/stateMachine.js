const allowedTransitions = {
  ALERT_RAISED: ['AWAITING_STOCK','PENDING_PICKING'],
  AWAITING_STOCK: ['PENDING_PICKING'],
  PENDING_PICKING: ['IN_TRANSIT'],
  IN_TRANSIT: ['COMPLETED'],
  COMPLETED: []
};

function canTransition(current, next) {
  if (!current) return false;
  const allowed = allowedTransitions[current] || [];
  return allowed.includes(next);
}

module.exports = { canTransition };
