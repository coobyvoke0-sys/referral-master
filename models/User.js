const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  referralCode: { type: String, unique: true, required: true },
  referredBy: { type: String, default: null },
  referralPoints: { type: Number, default: 0 },
  
  // NEW PAYMENT FIELDS HERE
  isActivated: { type: Boolean, default: false }, // Set to false by default!
  mpesaReceiptNumber: { type: String, default: null }, // Stores the M-PESA Code
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
