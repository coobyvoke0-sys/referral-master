require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Referral = require('./models/Referral');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serves frontend web files

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('🚀 Connected to MongoDB Atlas via Termux!'))
  .catch(err => console.error('❌ Connection Error:', err));

const generateReferralCode = (name) => {
  const cleanName = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${cleanName}${randomNum}`;
};

// --- 1. USER REGISTRATION ROUTE (WITH LOCK) ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, referredByCode } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let newReferralCode = generateReferralCode(name);
    let codeCheck = await User.findOne({ referralCode: newReferralCode });
    while (codeCheck) {
      newReferralCode = generateReferralCode(name);
      codeCheck = await User.findOne({ referralCode: newReferralCode });
    }

    let validReferrerCode = null;
    let referrerUser = null;

    if (referredByCode) {
      referrerUser = await User.findOne({ referralCode: referredByCode.toUpperCase() });
      if (referrerUser) {
        validReferrerCode = referrerUser.referralCode;
      }
    }

    // Creating user with isActivated set to false
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy: validReferrerCode,
      isActivated: false 
    });
    await newUser.save();

    // Referral transaction saved as pending (No points given yet!)
    if (referrerUser) {
      const referralLog = new Referral({
        referrerId: referrerUser._id,
        referredUserId: newUser._id,
        status: 'pending' 
      });
      await referralLog.save();
    }

    res.status(201).json({
      message: "Account created! Please pay the KES 100 registration fee to activate.",
      userId: newUser._id,
      isActivated: false
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// --- 2. PAYMENT VERIFICATION ROUTE ---
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { userId, mpesaReceipt } = req.body;

    // Find and check user activation status
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isActivated) return res.status(400).json({ error: "Account already active" });

    // Activate the user account
    user.isActivated = true;
    user.mpesaReceiptNumber = mpesaReceipt.toUpperCase().trim();
    await user.save();

    // Find the pending referral log and mark it complete
    const pendingReferral = await Referral.findOne({ referredUserId: userId, status: 'pending' });
    if (pendingReferral) {
      pendingReferral.status = 'completed';
      await pendingReferral.save();

      // Distribute points to the original referrer
      const referrer = await User.findById(pendingReferral.referrerId);
      if (referrer) {
        referrer.referralPoints += 100;
        await referrer.save();
        console.log(`🎉 Success! Points given to ${referrer.name}`);
      }
    }

    res.status(200).json({ message: "Payment verified successfully! Account is now active." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error processing payment verification" });
  }
});

// --- 3. USER DASHBOARD ROUTE ---
app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ error: "User not found" });

    const inviteHistory = await Referral.find({ referrerId: userId })
      .populate('referredUserId', 'name email createdAt isActivated')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      dashboard: {
        userName: user.name,
        userEmail: user.email,
        myInviteCode: user.referralCode,
        totalReferralPoints: user.referralPoints,
        totalInvitesCount: inviteHistory.length,
        isActivated: user.isActivated,
        peopleIInvited: inviteHistory.map(log => ({
          name: log.referredUserId.name,
          email: log.referredUserId.email,
          accountStatus: log.referredUserId.isActivated ? "Activated" : "Pending Payment",
          referralStatus: log.status
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error retrieving dashboard data" });
  }
});

app.get('/', (req, res) => {
  res.send('Referral Master backend is alive on your phone!');
});

app.listen(3000, () => console.log('📡 Server active on http://localhost:3000'));

