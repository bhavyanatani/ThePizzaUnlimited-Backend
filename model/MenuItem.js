const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    image: String,
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
    available: { type: Boolean, default: true }
  });
  
module.exports = mongoose.model('MenuItem', MenuItemSchema);