import express from 'express';
import { requireAuth, getAuth } from "@clerk/express";
import { body, validationResult } from 'express-validator';
import MenuCategory from '../model/MenuCategory.js';
import MenuItem from '../model/MenuItem.js';
import Order from '../model/Order.js';
import Reservation from '../model/Reservation.js';
import Review from '../model/Review.js';
import Cart from '../model/Cart.js';
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const router = express.Router();

//Get all menu categories (Public)
router.get('/menu/categories', async (req, res) => {
  try {
    const categories = await MenuCategory.find();

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No categories found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Menu categories fetched successfully.',
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

//Get all menu items of a category (Public)
router.get('/menu/category/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      MenuItem.find({ category: id })
        .select("image name price available description")
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MenuItem.countDocuments({ category: id })
    ]);

    return res.status(200).json({
      success: true,
      message: items.length ? 'Items fetched.' : 'No items in this category.',
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items
    });

  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

//  Get details of a single menu item (Public)
router.get('/menu/item/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid item ID.' });
    }

    const menuItem = await MenuItem.findById(id).lean();

    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Menu item fetched successfully.',
      menuItem
    });

  } catch (error) {
    console.error('Error fetching menu item:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

//  Create a new order (Login required)
router.post(
  "/orders",
  requireAuth(),
  [
    body("items")
      .isArray({ min: 1 })
      .withMessage("Order must contain at least 1 item"),

    body("items.*.item")
      .notEmpty()
      .withMessage("Item ID missing"),

    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Item quantity must be at least 1"),

    body("paymentMethod")
      .notEmpty()
      .isIn(["Cash", "Card", "UPI"])
      .withMessage("Invalid payment method"),

    body("tableNumber")
      .notEmpty()
      .withMessage("Table number is required"),

    body("customerPhone")
      .notEmpty()
      .isLength({ min: 10, max: 10 })
      .withMessage("Phone must be 10 digits"),

    body("customerEmail")
      .notEmpty()
      .isEmail()
      .withMessage("Valid email is required"),

    body("totalAmount")
      .notEmpty()
      .isNumeric()
      .withMessage("Total amount must be numeric"),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        items,
        paymentMethod,
        tableNumber,
        customerPhone,
        customerEmail,
        orderNotes,
        totalAmount,
      } = req.body;

      const newOrder = new Order({
        userId: req.auth.userId,
        items,
        paymentMethod,
        tableNumber,
        customerPhone,
        customerEmail,
        orderNotes: orderNotes || "",
        totalAmount,
        status: "Pending",
      });

      await newOrder.save();

      res.status(201).json({
        success: true,
        order: newOrder,
      });
    } catch (err) {
      console.error("Order create error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

//  Get all orders of logged-in user (Login required)
router.get('/orders/my', requireAuth(), async (req, res) => {
  try {
    const { userId } = req.auth;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ userId }).select("items totalAmount status createdAt")
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments({ userId })
    ]);

    return res.status(200).json({
      success: true,
      message: orders.length ? 'Orders fetched successfully.' : 'No orders yet.',
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
      orders
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Get a single order by ID
router.get('/orders/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.userId;

    const order = await Order.findOne({ _id: id, userId })
      .populate("items.item");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });

  } catch (error) {
    console.error("Error fetching order:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

//Cancelling an order
router.put('/orders/:id', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const orderId = req.params.id;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this order."
      });
    }

    if (order.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending orders can be cancelled."
      });
    }

    order.status = "Cancelled";
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order
    });

  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Create a new reservation (Login required)
router.post(
  '/reservations',
  requireAuth(),
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Please enter your name for the reservation.'),

    body('peopleCount')
      .isInt({ min: 1, max: 20 })
      .withMessage('Number of people must be between 1 and 20.'),

    body('date')
      .notEmpty()
      .withMessage('Please select a date for your reservation.')
      .bail()
      .isISO8601()
      .withMessage('Please enter a valid date in YYYY-MM-DD format.')
      .custom(value => {
        const selectedDate = new Date(value);
        const today = new Date();
        selectedDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          throw new Error('Reservation date cannot be in the past.');
        }
        return true;
      }),

    body('time')
      .notEmpty()
      .withMessage('Please select a time for your reservation.'),

    body('specialRequest')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Special request should not exceed 200 characters.')
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation details. Please check your form.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const { name, peopleCount, date, time, specialRequest } = req.body;

      const newReservation = new Reservation({
        userId: req.auth.userId,
        name,
        peopleCount,
        date,
        time,
        specialRequest
      });

      await newReservation.save();

      res.status(201).json({
        success: true,
        message: 'Reservation created successfully!',
        reservation: newReservation
      });
    } catch (error) {
      console.error('Error creating reservation:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get all reservations of logged-in user (Login required)
router.get('/reservations/my', requireAuth(), async (req, res) => {
  try {
    const { userId } = req.auth;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find({ userId }).select("name peopleCount date time status createdAt")
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Reservation.countDocuments({ userId })
    ]);

    const formattedReservations = reservations.map((r) => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: formattedReservations.length ? 'Reservations fetched successfully.' : 'No reservations yet.',
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReservations: total,
      reservations: formattedReservations
    });

  } catch (error) {
    console.error('Error fetching reservations:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

//  Cancel a reservation (Login required)
router.put('/reservations/:id', requireAuth(), async (req, res) => {
  try {
    const reservationId = req.params.id;
    const userId = req.auth.userId;

    let reservation = await Reservation.findById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found.'
      });
    }

    if (reservation.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this reservation.'
      });
    }

    if (reservation.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending reservations can be cancelled.'
      });
    }

    reservation.status = 'Cancelled';
    await reservation.save();

    res.status(200).json({
      success: true,
      message: 'Reservation cancelled successfully.',
      reservation
    });

  } catch (error) {
    console.error('Error cancelling reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

//Add a new review (Login required)
router.post(
  '/reviews',
  requireAuth(),
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Please enter your name for the review.'),

    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5.'),

    body('comment')
      .trim()
      .notEmpty()
      .withMessage('Please enter a comment for your review.')
      .isLength({ max: 300 })
      .withMessage('Comment should not exceed 300 characters.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review data. Please check your inputs.',
        errors: errors.array().map(err => err.msg)
      });
    }

    try {
      const { name, rating, comment } = req.body;

      const newReview = new Review({
        userId: req.auth.userId,
        name,
        rating,
        comment
      });

      await newReview.save();

      res.status(201).json({
        success: true,
        message: 'Review added successfully!',
        review: newReview
      });
    } catch (error) {
      console.error('Error adding review:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

//Get all reviews (Public)
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
      message: reviews.length ? "Reviews fetched successfully." : "No reviews yet.",
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReviews: total,
      reviews
    });

  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get the authenticated user's info
router.get("/me", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    // You can fetch extended data if you store users in your own DB
    const user = await User.findOne({ clerkId: userId });

    res.status(200).json({
      success: true,
      message: "User authenticated successfully",
      user: user || { clerkId: userId },
    });
  } catch (error) {
    console.error("Auth check failed:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

//Add to Cart
router.post('/cart/add', requireAuth(), async (req, res) => {
  try {
    const { itemId, quantity = 1 } = req.body;
    const userId = req.auth.userId;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existingItem = cart.items.find(
      (i) => i.item.toString() === itemId
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({ item: itemId, quantity });
    }

    cart.updatedAt = new Date();
    await cart.save();

    res.status(200).json({ success: true, message: "Item added to cart", cart });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

//Get the user cart
router.get('/cart/my', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    const cart = await Cart.findOne({ userId })
      .populate('items.item', 'name price image')
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Your cart is empty.',
        items: [],
      });
    }

    res.status(200).json({ success: true, cart });
  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/cart/:itemId', requireAuth(), async (req, res) => {
  try {
    const { quantity } = req.body;
    const userId = req.auth.userId;
    const { itemId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const getItemId = (entry) => {
      if (!entry.item) return null;
      if (entry.item._id) return entry.item._id.toString();
      return entry.item.toString();
    };

    const item = cart.items.find(i => getItemId(i) === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not in cart" });
    }

    if (quantity <= 0) {
      cart.items = cart.items.filter(i => getItemId(i) !== itemId);
    } else {
      item.quantity = quantity;
    }

    cart.updatedAt = new Date();
    await cart.save();
    await cart.populate("items.item");

    res.status(200).json({
      success: true,
      message: "Cart updated",
      cart
    });

  } catch (err) {
    console.error("UPDATE CART ERROR:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
});

//delete an item
router.delete('/cart/:itemId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { itemId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    cart.items = cart.items.filter(i => i.item.toString() !== itemId);
    await cart.save();
    await cart.populate("items.item");

    res.status(200).json({
      success: true,
      message: "Item removed",
      cart
    });

  } catch (err) {
    console.error("Error removing item:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

//Get the count of items in the cart
router.get("/cart/count", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const cart = await Cart.findOne({ userId });
    const count = cart?.items?.length || 0;
    res.status(200).json({ success: true, count });
  } catch (err) {
    console.error("Error fetching cart count:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
});

router.get("/test", (req, res) => {
  console.log("🔥 TEST ROUTE HIT");
  res.send("test ok");
});

//Get the invoice
router.get("/orders/:id/invoice", requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("items.item");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.auth.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order._id}.pdf`
    );

    doc.pipe(res);

    const logoPath = "./photos/logo.png"; 

    try {
      doc.image(logoPath, 40, 40, { width: 120 });
    } catch {
      doc.fontSize(22).text("THE PIZZA UNLIMITED", 40, 40);
    }

    doc.moveDown(3);

    doc.fontSize(20).text("INVOICE", { align: "right" });
    doc.moveDown(1);

    doc.fontSize(12);
    doc.text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
    doc.text(`Customer: ${req.auth.userId}`);
    doc.moveDown(1.5);

    doc.fontSize(14).text("Order Items", { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(12);

    const tableTop = doc.y;

    doc.text("Item", 40, tableTop);
    doc.text("Qty", 260, tableTop);
    doc.text("Price", 320, tableTop);
    doc.text("Total", 420, tableTop);
    doc.moveDown();

    let y = doc.y;

    order.items.forEach((item) => {
      doc.text(item.item.name, 40, y);
      doc.text(item.quantity.toString(), 260, y);
      doc.text(`₹${item.item.price}`, 320, y);
      doc.text(`₹${item.item.price * item.quantity}`, 420, y);

      y += 20;
    });

    doc.moveDown(2);

    const subtotal = order.items.reduce(
      (sum, i) => sum + i.item.price * i.quantity,
      0
    );

    const gst = subtotal * 0.18;
    const serviceFee = 20;
    const total = subtotal + gst + serviceFee;

    doc.fontSize(12);
    doc.text(`Subtotal: ₹${subtotal}`, { align: "right" });
    doc.text(`GST (18%): ₹${gst.toFixed(2)}`, { align: "right" });
    doc.text(`Service Fee: ₹${serviceFee}`, { align: "right" });
    doc.moveDown(1);
    doc.fontSize(16).text(`Total: ₹${total.toFixed(2)}`, { align: "right" });

    doc.moveDown(2);

    const qrData = await QRCode.toDataURL(
      `upi://pay?pa=yourupi@bank&pn=PizzaUnlimited&am=${total}&cu=INR`
    );

    const qrImage = qrData.replace(/^data:image\/png;base64,/, "");

    doc.fontSize(14).text("Scan to Pay (UPI)", 40);
    doc.image(Buffer.from(qrImage, "base64"), 40, doc.y, {
      width: 130,
      height: 130,
    });

    doc.moveDown(8);

    doc.fontSize(10).text(
      "Thank you for ordering with The Pizza Unlimited!",
      40,
      780,
      { align: "center", width: 520 }
    );

    doc.end();
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
