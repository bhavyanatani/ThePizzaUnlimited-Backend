const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  
  name: { 
    type: String, 
    required: true 
  }, 
  
  peopleCount: { 
    type: Number, 
    required: true, 
    min: 1 
  }, 
  
  date: { 
    type: Date, 
    required: true 
  },
  
  time: { 
    type: String, 
    required: true 
  },
  
  specialRequest: { 
    type: String, 
    default: "" 
  },
  
  status: { 
    type: String, 
    enum: ['Pending', 'Confirmed','Completed', 'Cancelled'], 
    default: 'Pending', 
  }
}, { timestamps: true });

module.exports = mongoose.model('Reservation', ReservationSchema);
