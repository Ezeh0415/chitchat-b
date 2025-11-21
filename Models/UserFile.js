const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    googleId: { type: String, default: null },

    firstName: String,
    lastName: String,
    profileImage: String,

    password: { type: String, select: false }, // null for google accounts

    otp: Number,
    otpExpire: Date,

    city: String,
    country: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
