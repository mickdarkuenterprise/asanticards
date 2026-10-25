// ── Shipping methods — single source of truth ───────────────────
// Served to the frontend by GET /api/shipping_methods and used by
// POST /api/orders to calculate what the customer is charged.
// Order matters: the frontend selects the first method by default.
const SHIPPING_METHODS = [
  { id: 'standard', name: 'Standard', price: 50,  delivery_time: '3–5 business days' },
  { id: 'express',  name: 'Express',  price: 80,  delivery_time: '1–2 business days' },
  { id: 'diaspora', name: 'Diaspora', price: 200, delivery_time: '7–14 business days' },
];

// Every order pays the listed price for its method — there is no free shipping
function getShippingCost(methodId) {
  const method = SHIPPING_METHODS.find(m => m.id === methodId);
  return method ? method.price : undefined;
}

module.exports = { SHIPPING_METHODS, getShippingCost };
