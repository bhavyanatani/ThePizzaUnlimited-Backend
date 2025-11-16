const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
        quantity: { type: Number, default: 1 }
      }
    ],
    totalAmount: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ['Pending', 'Preparing','Ready', 'Completed', 'Cancelled'], 
      default: 'Pending' 
    },
    createdAt: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["Cash", "Card", "UPI"],
    },
    
    tableNumber: {
      type: String,
      required: true,
    },
    
    customerPhone: {
      type: String,
      required: true,
    },
    
    customerEmail: {
      type: String,
      required: true,
    },
    
    orderNotes: {
      type: String,
      default: "",
    },
    
  });
  
  module.exports = mongoose.model('Order', OrderSchema);
  