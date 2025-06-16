const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require('dotenv').config();

const userModel = require("../models/user.model");

// ✅ Register a new user
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 🔹 Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // 🔹 Check if user already exists
    const existingUser = await userModel.findUserByEmail(req.pgPool, email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already in use." });
    }

    // 🔹 Password Validation (example)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters, contain a number, and a special character." });
    }

    // 🔹 Create user
    const newUser = await userModel.createUser(req.pgPool, { username, email, password });

    // 🔹 Generate refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await userModel.saveRefreshToken(req.pgPool, newUser.id, refreshToken);

    return res.status(201).json({ success: true, message: "User registered successfully!", user: newUser });
  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

// ✅ Login a user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔹 Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // 🔹 Check if user exists
    const user = await userModel.findUserByEmail(req.pgPool, email);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or password." });
    }

    // 🔹 Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid email or password." });
    }

    // 🔹 Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    // 🔹 Generate refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await userModel.saveRefreshToken(req.pgPool, user.id, refreshToken);

    return res.json({
      success: true,
      message: "Login successful!",
      user: { id: user.id, username: user.username, email: user.email },
      accessToken: token,
      refreshToken: refreshToken,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

// ✅ Update password
const updatePassword = async (req, res) => {
  try {
    const userId = req.user.id; // from authMiddleware
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All password fields are required." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New password and confirmation do not match." });
    }

    // Validate new password strength
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters, contain a number, and a special character." });
    }

    // Get user from DB
    const user = await userModel.findUserById(req.pgPool, userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in DB
    await userModel.updatePassword(req.pgPool, userId, hashedPassword);

    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Update Password Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // from authMiddleware
    const { username, email, profileImage } = req.body;

    if (!username || !email) {
      return res.status(400).json({ success: false, message: "Username and email are required." });
    }

    // Check if email is already used by another user
    const existingUser = await userModel.findUserByEmail(req.pgPool, email);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ success: false, message: "Email already in use by another user." });
    }

    // Update user in DB
    const updatedUser = await userModel.updateUser(req.pgPool, userId, { username, email, profileImage });

    return res.json({ success: true, message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Auth Controller: Fetching profile for user ID:", userId);
    const user = await userModel.findUserById(req.pgPool, userId);
    if (!user) {
      console.log("Auth Controller: User not found for ID:", userId);
      return res.status(404).json({ success: false, message: "User not found." });
    }
    // Exclude password from response
    const { password, ...userData } = user;
    console.log("Auth Controller: User profile fetched successfully for ID:", userId);
    return res.json({ success: true, user: userData });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required." });
    }

    const user = await userModel.findUserByRefreshToken(req.pgPool, refreshToken);
    if (!user) {
      return res.status(403).json({ message: "Invalid refresh token." });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    return res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = { register, login, updatePassword, updateProfile, getProfile, refreshToken };
