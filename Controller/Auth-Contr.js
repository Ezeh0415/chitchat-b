const { getDB } = require("../Models/Db");
const bcrypt = require("bcrypt");
const { handleError } = require("../Utils/ErrorHandler");
const generateNumericOTP = require("../Utils/OtpGenerator");
const generateTokens = require("../Utils/TokenGenerate");
const { sendOtpEmail } = require("../Utils/Mailer");

const saltRounds = 10;

const signup = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return handleError(res, null, "All inputs are required", 400);
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return handleError(res, null, "Invalid email format", 400);
  }

  // Password length check (at least 8 characters)
  if (password.length < 8) {
    return handleError(
      res,
      null,
      "Password must be at least 8 characters long",
      400
    );
  }

  // Name validation (no numbers or special chars, min 2 chars)
  const nameRegex = /^[A-Za-z]{2,}$/;
  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    return handleError(
      res,
      null,
      "Names must be at least 2 letters and contain only alphabets",
      400
    );
  }

  try {
    const db = getDB();
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return handleError(res, null, "User already exists", 409);
    }

    const otp = generateNumericOTP();
    const pwdHash = await bcrypt.hash(password, saltRounds);
    const otpHash = await bcrypt.hash(otp, saltRounds);
    const now = new Date();

    const user = {
      firstName,
      lastName,
      email,
      password: pwdHash,
      otp: otpHash,
      otpExpire: new Date(now.getTime() + 10 * 60 * 1000),
      createdAt: new Date(), // 10 minutes
      profileImage: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    };
    const result = await db.collection("users").insertOne(user);

    const newUser = await db
      .collection("users")
      .findOne({ _id: result.insertedId });

    const { accessToken, refreshToken } = await generateTokens({
      id: newUser._id,
      email: newUser.email,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        profileImage: newUser.profileImage,
      },
      accessToken,
    });

    const subject = `chitChat Account Verification Code`;
    const message = `
      <p>Dear ${newUser.firstName} ${newUser.lastName},</p>
      <p>Your verification code is:</p>
      <h2 style="color:#2c3e50;">${otp}</h2>
      <p>Please enter this code within 5 minutes to verify your account.</p>
      <p>If you did not request this, please disregard this email.</p>
      <br/>
      <p>Thank you for choosing <strong>chitChat</strong>.</p>
    `;

    sendOtpEmail(email, subject, message).catch((error) =>
      console.error("Error sending email:", error)
    );
  } catch (error) {
    handleError(res, error, "Error creating user");
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return handleError(res, null, "Email and password are required", 400);
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return handleError(res, null, "Invalid email format", 400);
  }

  // Password length check (e.g., at least 8 characters)
  if (password.length < 8) {
    return handleError(
      res,
      null,
      "Password must be at least 8 characters long",
      400
    );
  }

  try {
    const db = getDB();
    const existingUser = await db.collection("users").findOne({ email });
    if (!existingUser) {
      return handleError(res, null, "user not found ", 400);
    }
    const isPwdValid = await bcrypt.compare(password, existingUser.password);
    if (!isPwdValid) {
      return handleError(res, null, "password is not correct try again", 400);
    }

    const { accessToken, refreshToken } = generateTokens({
      id: existingUser._id,
      email: existingUser.email,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send accessToken in the response body
    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        _id: existingUser._id,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        email: existingUser.email,
        profileImage: existingUser.profileImage,
      },
      accessToken,
    });
  } catch (error) {
    handleError(res, error, "Error logging in user");
  }
};

const VerifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return handleError(res, null, "Email and OTP are required", 400);
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return handleError(res, null, "Invalid email format", 400);
  }

  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return handleError(
        res,
        null,
        "User not found. Please sign up or log in.",
        400
      );
    }

    const isValidOtp = await bcrypt.compare(otp, user.otp);
    if (!isValidOtp) {
      return handleError(
        res,
        null,
        "OTP does not match. Please try again.",
        400
      );
    }

    const now = new Date();
    const otpCreatedAt = new Date(user.otpCreatedAt);
    const otpExpiry = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

    if (otpCreatedAt < otpExpiry) {
      return handleError(
        res,
        null,
        "OTP has expired. Please request a new one.",
        400
      );
    }

    await db.collection("users").updateOne(
      { email },
      {
        $set: { isVerified: true },
        $unset: { otp: "", otpExpire: "" },
      }
    );

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    return handleError(
      res,
      error,
      "OTP verification failed due to server error",
      500
    );
  }
};

const ResetOtp = async (req, res) => {
  const { email } = req.body;
  if (!email)
    return handleError(res, null, "could not get the sent email", 404);
  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email });
    if (!user) return handleError(res, null, "user can`t be found ", 404);

    const otp = generateNumericOTP();
    const otpHash = await bcrypt.hash(otp, saltRounds);
    await db
      .collection("users")
      .updateOne(
        { email },
        { $set: { isVerified: false, otp: otpHash, otpExpire: new Date() } }
      );

    const subject = `chitChat Account Verification Code`;
    const message = `
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your verification code is:</p>
      <h2 style="color:#2c3e50;">${otp}</h2>
      <p>Please enter this code within 5 minutes to verify your account.</p>
      <p>If you did not request this, please disregard this email.</p>
      <br/>
      <p>Thank you for choosing <strong>chitChat</strong>.</p>
    `;

    sendOtpEmail(email, subject, message).catch((error) =>
      console.error("Error sending email:", error)
    );
    return res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    handleError(res, err, "ERROR RESENDING OTP");
  }
};

// Logout Controller
const logout = async (req, res) => {
  res.clearCookie("refreshToken", { httpOnly: true, sameSite: "Strict" });
  res.status(200).json({ message: "Logged out successfully" });
};

const getProfile = async (req, res) => {
  const { email } = req.params;
  if (!email) {
    return handleError(res, null, "Email is required", 400);
  }
  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email });
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        posts: user.posts,
        notifications: user.notifications,
        FriendRequestsNotifications: user.FriendRequestsNotifications,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch user profile", 500);
  }
};
const usersGetProfile = async (req, res) => {
  const { email } = req.params;
  if (!email) {
    return handleError(res, null, "Email is required", 400);
  }
  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        posts: user.posts,
      },
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch user profile", 500);
  }
};

module.exports = {
  signup,
  login,
  VerifyOtp,
  ResetOtp,
  logout,
  getProfile,
  usersGetProfile,
};
