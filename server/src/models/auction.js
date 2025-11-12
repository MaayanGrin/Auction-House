const mongoose = require('mongoose');
const { Schema } = mongoose;

const BidSchema = new Schema({
  clientId: String,
  bidder: String,
  amount: Number,
  time: { type: Date, default: Date.now }
}, { _id: true });

const AuctionSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  currency: { type: String, default: 'USD' },
  startingPrice: { type: Number, required: true },
  reservePrice: { type: Number, default: null },
  bids: { type: [BidSchema], default: [] },
  highest: { type: BidSchema, default: null },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'active','ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const Auction = mongoose.models.Auction || mongoose.model('Auction', AuctionSchema);

module.exports = Auction;