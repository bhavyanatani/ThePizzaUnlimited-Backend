const mongoose = require('mongoose');

const CartSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Clerk user ID

  items: [
    {
      item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
      quantity: { type: Number, default: 1, min: 1 },
    },
  ],

  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Cart', CartSchema);
