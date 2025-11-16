import mongoose from 'mongoose';

const MenuCategorySchema = new mongoose.Schema({
  name: String,
  description: String,
  isOrderable: { type: Boolean, default: true }
});

// Auto-update items when a category is toggled
MenuCategorySchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;

  const MenuItem = mongoose.model('MenuItem');

  // Category turned OFF → disable all items
  if (doc.isOrderable === false) {
    await MenuItem.updateMany(
      { category: doc._id },
      { available: false }
    );
  }

  if (doc.isOrderable === true) {
    await MenuItem.updateMany(
      { category: doc._id },
      { available: true }
    );
  }

});

export default mongoose.model('MenuCategory', MenuCategorySchema);
