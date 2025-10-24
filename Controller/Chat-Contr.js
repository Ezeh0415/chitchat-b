const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const { getIO } = require("../Models/Socket");

const getChatUser = async (req, res) => {
  // Chat user retrieval logic here
  const { userEmail, chatEmail } = req.body;
  const requestId = req.params.id;

  if (!userEmail || !chatEmail || ObjectId.isValid(!requestId)) {
    return handleError(res, null, "Invalid input", 400);
  }

  try {
    const db = getDB();

    await db.collection("users").findOne({ email: userEmail });

    const chatUser = await db.collection("users").findOne({ email: chatEmail });

    if (!chatUser) {
      return handleError(res, null, "Chat user not found", 404);
    }
    res.status(200).json({
      data: {
        _id: chatUser._id,
        email: chatUser.email,
        firstName: chatUser.firstName,
        lastName: chatUser.lastName,
        profileImage: chatUser.profileImage,
      },
    });

    // Implement chat user retrieval logic here
  } catch (error) {
    console.error("GET /api/chat/user error:", error);
    handleError(res, error, "Failed to fetch chat user");
  }
};

module.exports = {
  // Add chat controller methods here
  getChatUser,
};
