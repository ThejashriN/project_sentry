const mongoose = require('mongoose');
const { Schema } = mongoose;

const HistorySchema = new Schema({
  stage: String,
  timestamp: { type: Date, default: Date.now },
  metadata: Schema.Types.Mixed
}, { _id: false });

const TransferOrderSchema = new Schema({
  order_id: String,
  quantity: Number,
  warehouse_id: String,
  created_at: { type: Date, default: Date.now }
}, { _id: false });

const ShipmentSchema = new Schema({
  tracking_number: String,
  carrier: String,
  shipped_at: Date
}, { _id: false });

const ReplenishmentOrderSchema = new Schema({
  replenishment_id: { type: String, unique: true, required: true },
  store_id: { type: String, required: true },
  product_id: { type: String, required: true },
  requested_qty: { type: Number, default: 0 },
  status: { type: String, enum: ['ALERT_RAISED','AWAITING_STOCK','PENDING_PICKING','IN_TRANSIT','COMPLETED'], default: 'ALERT_RAISED' },
  history: [HistorySchema],
  transfer_order: TransferOrderSchema,
  shipment: ShipmentSchema
}, { timestamps: true });

const WarehouseInventorySchema = new Schema({
  warehouse_id: String,
  product_id: String,
  quantity: Number
});

const StoreInventorySchema = new Schema({
  store_id: String,
  product_id: String,
  quantity: Number
});

const ReplenishmentOrder = mongoose.model('ReplenishmentOrder', ReplenishmentOrderSchema);
const WarehouseInventory = mongoose.model('WarehouseInventory', WarehouseInventorySchema);
const StoreInventory = mongoose.model('StoreInventory', StoreInventorySchema);

module.exports = { ReplenishmentOrder, WarehouseInventory, StoreInventory };
