require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { ReplenishmentOrder, WarehouseInventory, StoreInventory } = require('./models');
const { initProducer, sendMessage, createConsumer } = require('./kafkaClient');
const { canTransition } = require('./stateMachine');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGODB_URI || '';

mongoose.connect(MONGO).then(() => console.log('Mongo connected')).catch(err => { console.error(err); process.exit(1); });

async function pushHistoryAndSave(order, stage, metadata) {
  order.history = order.history || [];
  order.history.push({ stage, timestamp: new Date(), metadata });
  order.updatedAt = new Date();
  await order.save();
}

// 1) POST /api/alerts  (Stage 1)
app.post('/api/alerts', async (req, res) => {
  try {
    const { store_id, product_id, requested_qty } = req.body;
    if (!store_id || !product_id) return res.status(400).json({ error: 'store_id and product_id required' });

    const replenishment_id = `REP-${uuidv4()}`;
    const order = new ReplenishmentOrder({
      replenishment_id, store_id, product_id, requested_qty: requested_qty || 0,
      status: 'ALERT_RAISED',
      history: [{ stage: 'ALERT_RAISED', timestamp: new Date(), metadata: { fromPOS: true } }]
    });
    await order.save();

    await sendMessage('low_stock_alerts', {
      replenishment_id, store_id, product_id, requested_qty: requested_qty || 0
    });

    return res.status(201).json({ replenishment_id, status: order.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

// 2) POST /api/transfer-orders  (Stage 2)
app.post('/api/transfer-orders', async (req, res) => {
  try {
    const { replenishment_id, quantity, warehouse_id } = req.body;
    if (!replenishment_id || !quantity) return res.status(400).json({ error: 'replenishment_id and quantity required' });

    const order = await ReplenishmentOrder.findOne({ replenishment_id });
    if (!order) return res.status(404).json({ error: 'replenishment not found' });
    if (!canTransition(order.status, 'PENDING_PICKING')) {
      return res.status(400).json({ error: `cannot transition ${order.status} -> PENDING_PICKING` });
    }

    const alloc = await WarehouseInventory.findOneAndUpdate(
      { product_id: order.product_id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true }
    );
    if (!alloc) {
      order.status = 'AWAITING_STOCK';
      await pushHistoryAndSave(order, 'AWAITING_STOCK', { message: 'insufficient warehouse stock' });
      return res.status(409).json({ error: 'insufficient warehouse stock' });
    }

    const transferId = `TO-${uuidv4()}`;
    order.transfer_order = { order_id: transferId, quantity, warehouse_id: warehouse_id || process.env.DEFAULT_WAREHOUSE_ID || 'WH1' };
    order.status = 'PENDING_PICKING';
    await pushHistoryAndSave(order, 'PENDING_PICKING', { transfer_order: order.transfer_order });

    await sendMessage('transfer_orders', { replenishment_id, transfer_id: transferId, product_id: order.product_id, quantity });

    return res.json({ replenishment_id, transfer_order: order.transfer_order, status: order.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

// 3) PATCH /api/shipments/:replenishment_id/ship  (Stage 3)
app.patch('/api/shipments/:replenishment_id/ship', async (req, res) => {
  try {
    const { replenishment_id } = req.params;
    const { carrier } = req.body;
    const order = await ReplenishmentOrder.findOne({ replenishment_id });
    if (!order) return res.status(404).json({ error: 'not found' });
    if (!canTransition(order.status, 'IN_TRANSIT')) return res.status(400).json({ error: `cannot transition ${order.status} -> IN_TRANSIT` });

    const tracking = `TRK-${uuidv4().split('-')[0]}`;
    order.shipment = { tracking_number: tracking, carrier: carrier || 'DefaultCarrier', shipped_at: new Date() };
    order.status = 'IN_TRANSIT';
    await pushHistoryAndSave(order, 'IN_TRANSIT', { shipment: order.shipment });

    await sendMessage('shipments', { replenishment_id, tracking: tracking, carrier: order.shipment.carrier });

    return res.json({ replenishment_id, tracking, status: order.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

// 4) PATCH /api/receipts/:replenishment_id/receive  (Stage 4)
app.patch('/api/receipts/:replenishment_id/receive', async (req, res) => {
  try {
    const { replenishment_id } = req.params;
    const order = await ReplenishmentOrder.findOne({ replenishment_id });
    if (!order) return res.status(404).json({ error: 'not found' });
    if (!canTransition(order.status, 'COMPLETED')) return res.status(400).json({ error: `cannot transition ${order.status} -> COMPLETED` });

    const qty = (order.transfer_order && order.transfer_order.quantity) || (order.requested_qty || 0);

    await StoreInventory.findOneAndUpdate(
      { store_id: order.store_id, product_id: order.product_id },
      { $inc: { quantity: qty } },
      { upsert: true, new: true }
    );

    order.status = 'COMPLETED';
    await pushHistoryAndSave(order, 'COMPLETED', { received_qty: qty });

    await sendMessage('receipts', { replenishment_id, store_id: order.store_id, product_id: order.product_id, qty });

    return res.json({ replenishment_id, status: order.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET endpoints
app.get('/api/replenishments/:id', async (req, res) => {
  const order = await ReplenishmentOrder.findOne({ replenishment_id: req.params.id });
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
});

app.get('/api/replenishments', async (req, res) => {
  const list = await ReplenishmentOrder.find().limit(100).sort({ createdAt: -1 });
  res.json(list);
});

// Kafka consumers for orchestration
async function startKafkaConsumers() {
  await initProducer();

  await createConsumer('sentry-lowstock-group', ['low_stock_alerts'], async ({ message }) => {
    try {
      const payload = JSON.parse(message.value.toString());
      const { replenishment_id, requested_qty } = payload;
      const order = await ReplenishmentOrder.findOne({ replenishment_id });
      if (!order) return;
      if (!canTransition(order.status, 'PENDING_PICKING')) return;

      const quantity = requested_qty || order.requested_qty || 1;
      const alloc = await WarehouseInventory.findOneAndUpdate(
        { product_id: order.product_id, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { new: true }
      );

      if (!alloc) {
        order.status = 'AWAITING_STOCK';
        await pushHistoryAndSave(order, 'AWAITING_STOCK', { message: 'insufficient stock (auto)' });
        return;
      }

      const transferId = `TO-${uuidv4()}`;
      order.transfer_order = { order_id: transferId, quantity, warehouse_id: process.env.DEFAULT_WAREHOUSE_ID || 'WH1' };
      order.status = 'PENDING_PICKING';
      await pushHistoryAndSave(order, 'PENDING_PICKING', { transfer_order: order.transfer_order });

      await sendMessage('transfer_orders', { replenishment_id, transfer_id: transferId, product_id: order.product_id, quantity });

    } catch (e) {
      console.error('Kafka consumer error:', e);
    }
  });
}

startKafkaConsumers().catch(err => {
  console.error('Failed to start Kafka consumers', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Project Sentry API listening on port ${PORT}`);
});
