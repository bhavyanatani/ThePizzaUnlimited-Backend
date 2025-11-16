import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import MenuCategory from '../model/MenuCategory.js';
import MenuItem from '../model/MenuItem.js';
import Order from '../model/Order.js';
import Reservation from '../model/Reservation.js';
import Review from '../model/Review.js';
import { authenticateAdmin, ADMIN_EMAIL, JWT_SECRET } from '../middleware/adminAuth.js';
const router = express.Router();
import { upload } from "../middleware/upload.js";

// --- Admin Auth (JWT) ---
const ADMIN_PASSWORD = 'BHAVYAnatani@321';

// Public: Admin login (no signup)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ sub: ADMIN_EMAIL, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ success: true, message: 'Login successful.', token });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.use(authenticateAdmin);

//get all categories
router.get('/menu/categories', async (req, res) => {
  try {
    const categories = await MenuCategory.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: categories.length ? 'Categories fetched.' : 'No categories found.',
      categories
    });
  } catch (error) {
    console.error('Error fetching menu categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

//add category
router.post(
  '/menu/category',

  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Please enter a category name.'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description should not exceed 200 characters.'),
    body('isOrderable')
      .optional()
      .isBoolean()
      .withMessage('isOrderable must be true or false.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category data. Please check your inputs.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const { name, description, isOrderable } = req.body;

      // prevent duplicate category names
      const existing = await MenuCategory.findOne({ name });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists.'
        });
      }

      const newCategory = new MenuCategory({ name, description, isOrderable });
      await newCategory.save();

      res.status(201).json({
        success: true,
        message: 'Category added successfully!',
        category: newCategory
      });
    } catch (error) {
      console.error('Error adding menu category:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error.'
      });
    }
  }
);

//update an category
router.put(
  '/menu/category/:id',

  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Category name cannot be empty.'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description should not exceed 200 characters.'),
    body('isOrderable')
      .optional()
      .isBoolean()
      .withMessage('isOrderable must be true or false.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category data.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID.' });
      }
      const { name, description, isOrderable } = req.body;
      const newCategory = {};
      if (name) newCategory.name = name;
      if (description) newCategory.description = description;
      if (typeof isOrderable === 'boolean') newCategory.isOrderable = isOrderable;

      let category = await MenuCategory.findById(req.params.id);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }

      category = await MenuCategory.findByIdAndUpdate(req.params.id, { $set: newCategory }, { new: true });

      res.status(200).json({
        success: true,
        message: 'Category updated successfully!',
        category
      });
    } catch (error) {
      console.error('Error updating menu category:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error.'
      });
    }
  }
);

//delete an category(also deletes its corresponding items)
router.delete('/menu/category/:id', async (req, res) => {
  try {
    const categoryId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID.' });
    }

    const category = await MenuCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.'
      });
    }

    const deletedItems = await MenuItem.deleteMany({ category: categoryId });
    await MenuCategory.findByIdAndDelete(categoryId);

    res.status(200).json({
      success: true,
      message: `Category "${category.name}" and ${deletedItems.deletedCount} associated item(s) deleted successfully.`,
      deletedCategory: category
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

//get all items
router.get('/menu/categories/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: 'Invalid ID' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      MenuItem.find({ category: id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MenuItem.countDocuments({ category: id })
    ]);

    return res.status(200).json({
      success: true,
      message: items.length ? 'Items fetched' : 'No items yet',
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});



//add an item
router.post(
  '/menu/categories/:id/items',
  upload.single("image"),
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Please enter the name of the item.'),
    body('price')
      .isFloat({ gt: 0 })
      .withMessage('Please enter a valid price greater than ₹0.'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description should not exceed 200 characters.')
  ],
  async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item data. Please check your inputs.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const categoryId = req.params.id;
      const { name, price, description } = req.body;

      const category = await MenuCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found. Please create it first.'
        });
      }

      let imageUrl = null;
      if (req.file && req.file.path) {
        imageUrl = req.file.path;   
      }

      const newItem = new MenuItem({
        category: categoryId,
        name,
        price,
        description,
        image: imageUrl,
      });

      await newItem.save();

      res.status(201).json({
        success: true,
        message: `Item "${name}" added successfully under "${category.name}" category! 🎉`,
        item: newItem
      });

    } catch (error) {
      console.error('Error adding menu item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

//update an item
router.put(
  '/menu/items/:id',

  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Item name cannot be empty.'),
    body('price')
      .optional()
      .isFloat({ gt: 0 })
      .withMessage('Price must be greater than ₹0.'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description should not exceed 200 characters.'),
    body('available')
      .optional()
      .isBoolean()
      .withMessage('Available must be true or false.'),
    body('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID format.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item data. Please check your inputs.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const { id } = req.params;
      const { name, price, description, available, category } = req.body;

      const newItemData = {};
      if (name) newItemData.name = name;
      if (price) newItemData.price = price;
      if (description) newItemData.description = description;
      if (typeof available === 'boolean') newItemData.available = available;

      if (category) {
        const categoryExists = await MenuCategory.findById(category);
        if (!categoryExists) {
          return res.status(404).json({
            success: false,
            message: 'New category not found. Please select a valid one.'
          });
        }
        newItemData.category = category;
      }

      let item = await MenuItem.findById(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Menu item not found.'
        });
      }

      item = await MenuItem.findByIdAndUpdate(id, { $set: newItemData }, { new: true }).populate('category', 'name');

      res.status(200).json({
        success: true,
        message: 'Item updated successfully! 🎉',
        updatedItem: item
      });
    } catch (error) {
      console.error('Error updating menu item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

//delete an item
router.delete('/menu/items/:id', async (req, res) => {
  try {
    const itemId = req.params.id;

    const item = await MenuItem.findById(itemId).populate('category', 'name');
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found.'
      });
    }

    await MenuItem.findByIdAndDelete(itemId);

    res.status(200).json({
      success: true,
      message: `Item "${item.name}" deleted successfully from category "${item.category?.name || 'Unknown'}".`,
      deletedItem: item
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

//------Order Routes------

//getting oll orders
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = req.query.status ? { status: req.query.status } : {};

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('items.item')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      message: orders.length ? 'Orders fetched' : 'No orders yet',
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
      orders
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


router.get('/orders/:id', async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Order ID.'
      });
    }

    const order = await Order.findById(orderId)
      .populate('items.item')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Order fetched successfully!',
      order
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.put(
  '/orders/:id/status',
  [body('status')
    .trim()
    .isIn(['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'])
    .withMessage('Invalid status value.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const orderId = req.params.id;
      const nextStatus = req.body.status;

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Order ID.'
        });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.'
        });
      }
      // Allowed status transitions moved to a single root source of truth
      const allowedTransitions = {
        Pending: ['Preparing', 'Cancelled'],
        Preparing: ['Ready', 'Cancelled'],
        Ready: ['Completed', 'Cancelled']
      };

      const currentStatus = order.status;

      if (['Completed', 'Cancelled'].includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from ${currentStatus}.`
        });
      }

      const allowedNext = allowedTransitions[currentStatus] || [];
      if (!allowedNext.includes(nextStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid transition. Allowed: ${allowedNext.join(', ') || 'none'}.`
        });
      }

      order.status = nextStatus;
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Order status updated successfully.',
        order
      });

    } catch (error) {
      console.error('Error updating order status:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

//-----Reservation routes------
//get all reservation
router.get('/reservations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Reservation.countDocuments()
    ]);

    return res.status(200).json({
      success: true,
      message: reservations.length ? "Reservations fetched" : "No reservations yet",
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReservations: total,
      reservations
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single reservation details
router.get('/reservation/:id', async (req, res) => {
  try {
    const reservationId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(reservationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Reservation ID.'
      });
    }

    const reservation = await Reservation.findById(reservationId).lean();

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reservation fetched successfully!',
      reservation
    });

  } catch (error) {
    console.error('Error fetching reservation:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update reservation status
router.put(
  '/reservation/:id/status',
  [
    body('status')
      .trim()
      .isIn(['Pending', 'Confirmed', 'Completed', 'Cancelled'])
      .withMessage('Invalid status value.')
  ],
  async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const reservationId = req.params.id;
      const nextStatus = req.body.status;

      if (!mongoose.Types.ObjectId.isValid(reservationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Reservation ID.'
        });
      }

      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Reservation not found.'
        });
      }

      const allowedTransitions = {
        Pending: ['Confirmed', 'Cancelled'],
        Confirmed: ['Completed', 'Cancelled']
      };

      const currentStatus = reservation.status;

      if (['Cancelled', 'Completed'].includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from ${currentStatus}.`
        });
      }

      const allowedNext = allowedTransitions[currentStatus] || [];
      if (!allowedNext.includes(nextStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid transition. Allowed: ${allowedNext.join(', ') || 'none'}.`
        });
      }

      reservation.status = nextStatus;
      await reservation.save();

      return res.status(200).json({
        success: true,
        message: 'Reservation status updated successfully.',
        reservation
      });

    } catch (error) {
      console.error('Error updating reservation status:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

//Reviews Routes
//get all reviews
router.get('/reviews', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments()
    ]);

    return res.status(200).json({
      success: true,
      message: reviews.length ? "Reviews fetched" : "No reviews yet",
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReviews: total,
      reviews
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


//deleting an spam review
router.delete('/reviews/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found!"
      })
    }
    await Review.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Review deleted successfully.',
      deletedReview: review
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/analytics/overview', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();

    const completedOrders = await Order.find({ status: 'Completed' }).select('totalAmount').lean();
    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    const totalReservations = await Reservation.countDocuments();

    const activeReservations = await Reservation.countDocuments({
      status: { $in: ['Pending', 'Confirmed'] }
    });

    const ordersByStatus = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // Get daily orders and revenue for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyOrders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          orderCount: { $sum: 1 },
          // Only sum revenue for completed orders
          revenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "Completed"] }, "$totalAmount", 0]
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Format daily data with day names
    const formattedDailyData = dailyOrders.map(item => {
      const date = new Date(item._id);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        date: item._id,
        day: dayNames[date.getDay()],
        orders: item.orderCount,
        revenue: item.revenue || 0
      };
    });

    res.status(200).json({
      success: true,
      message: "Analytics fetched successfully.",
      data: {
        totalOrders,
        totalRevenue,
        totalReservations,
        activeReservations,
        ordersByStatus,
        dailyOrders: formattedDailyData
      }
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
})

export default router;
