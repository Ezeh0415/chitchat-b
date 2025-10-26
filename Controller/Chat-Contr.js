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
        _id: requestId,
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

const chat = async (req, res) => {
  const { userEmail, chatEmail, message } = req.body;
  const requestId = req.params.id;

  if (!userEmail || !chatEmail || !message || !ObjectId.isValid(requestId)) {
    return handleError(res, null, "Invalid input", 400);
  }

  const requestIdObj = new ObjectId(requestId);

  try {
    const db = getDB();

    const UserData = await db.collection("users").findOne({
      email: userEmail,
      "Friends._id": requestIdObj,
    });

    const ChatData = await db.collection("users").findOne({
      email: chatEmail,
      "Friends._id": requestIdObj,
    });

    if (!UserData || !ChatData) {
      return handleError(res, null, "User or request not found", 404);
    }

    const userChatMessage = {
      _id: new ObjectId(),
      from: userEmail,
      to: chatEmail,
      message: message,
      timestamp: new Date(),
    };

    // Push message to both users
    await db
      .collection("users")
      .updateOne(
        { email: userEmail, "Friends._id": requestIdObj },
        { $push: { "Friends.$.chats": userChatMessage } }
      );

    await db
      .collection("users")
      .updateOne(
        { email: chatEmail, "Friends._id": requestIdObj },
        { $push: { "Friends.$.chats": userChatMessage } }
      );

    // Emit to room
    const io = getIO();
    const roomId = requestIdObj.toString();
    io.to(roomId).emit("chatMessage", {
      data: userChatMessage,
    });

    // Send response
    res
      .status(200)
      .json({ message: "Message sent successfully", chat: userChatMessage });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    handleError(res, error, "Failed to send chat message");
  }
};

const getChatMessages = async (req, res) => {
  const { userEmail, friendId } = req.body;

  const db = getDB();
  const user = await db.collection("users").findOne(
    { email: userEmail, "Friends._id": new ObjectId(friendId) },
    { projection: { "Friends.$": 1 } } // only get this friend
  );

  if (!user) return res.status(404).json({ message: "Friend not found" });

  const chats = user.Friends[0]?.chats || [];
  res.json(chats);
};

module.exports = {
  // Add chat controller methods here
  getChatUser,
  chat,
  getChatMessages,
};
