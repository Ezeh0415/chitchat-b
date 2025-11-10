const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const { getIO } = require("../Models/Socket");
const client = require("../Models/Redis");

const getChatUser = async (req, res) => {
  // Chat user retrieval logic here
  const { userEmail, chatEmail } = req.body;
  const requestId = req.params.id;

  if (!userEmail || !chatEmail || !ObjectId.isValid(requestId)) {
    return handleError(res, null, "Invalid input", 400);
  }

  try {
    const db = getDB();
    const redisKey = `chat:user:${chatEmail}`;

    const cached = await client.json.get(redisKey);

    if (cached) {
      return res.status(200).json({
        data: {
          _id: requestId,
          email: cached.email,
          firstName: cached.firstName,
          lastName: cached.lastName,
          profileImage: cached.profileImage,
        },
      });
    }

    // await db.collection("users").findOne({ email: userEmail });

    const chatUser = await db.collection("users").findOne({ email: chatEmail });

    if (!chatUser) {
      return handleError(res, null, "Chat user not found", 404);
    }

    const result = await client.json.set(redisKey, "$", chatUser, { NX: true });
    if (result) {
      await client.expire(redisKey, 3600);
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
  const roomId = requestIdObj.toString();

  try {
    const db = getDB();
    const io = getIO();
    const redisKey = `chat:messages:${roomId}`;

    const userChatMessage = {
      _id: new ObjectId(),
      from: userEmail,
      to: chatEmail,
      message,
      timestamp: new Date(),
    };

    // 1. Emit to room immediately
    io.to(roomId).emit("chatMessage", {
      data: userChatMessage,
    });

    // 2. Check Redis cache first
    const cachedMessages = await client.json.get(redisKey);

    if (cachedMessages?.Friends?.[0]) {
      // Update cache immediately
      cachedMessages.Friends[0].chats.push(userChatMessage);
      await client.json.set(redisKey, "$", cachedMessages);
      await client.expire(redisKey, 500); // Refresh TTL
    }

    // 3. Update MongoDB in background
    const updatePromises = [
      db
        .collection("users")
        .updateOne(
          { email: userEmail, "Friends._id": requestIdObj },
          { $push: { "Friends.$.chats": userChatMessage } }
        ),
      db
        .collection("users")
        .updateOne(
          { email: chatEmail, "Friends._id": requestIdObj },
          { $push: { "Friends.$.chats": userChatMessage } }
        ),
    ];

    // Handle MongoDB updates without blocking response
    Promise.all(updatePromises)
      .then(() => {
        console.log(`✅ Message synced to MongoDB for room ${roomId}`);
      })
      .catch((error) => {
        console.error("❌ Error syncing message to MongoDB:", error);
        // Consider implementing a retry mechanism here
      });

    // 4. Send immediate response
    return res.status(200).json({
      message: "Message sent successfully",
      chat: userChatMessage,
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return handleError(res, error, "Failed to send chat message");
  }
};

const getChatMessages = async (req, res) => {
  const { userEmail, friendId } = req.body;

  if (!userEmail || !ObjectId.isValid(friendId)) {
    handleError(res, null, "Invalid input", 400);
  }

  try {
    const db = getDB();
    const redisKey = `chat:messages:${friendId}`;
    const cached = await client.json.get(redisKey);
    if (cached) {
      const chats = cached.Friends[0]?.chats || [];
      return res.json(chats);
    }
    const user = await db.collection("users").findOne(
      { email: userEmail, "Friends._id": new ObjectId(friendId) },
      { projection: { "Friends.$": 1 } } // only get this friend
    );

    if (!user) return res.status(404).json({ message: "Friend not found" });

    await client.json.set(redisKey, "$", user);
    await client.expire(redisKey, 3600);

    const chats = user.Friends[0]?.chats || [];
    return res.json(chats);
  } catch (error) {
    console.error("GET /api/chat/messages error:", error);
    handleError(res, error, "Failed to fetch chat messages");
  }
};

module.exports = {
  // Add chat controller methods here
  getChatUser,
  chat,
  getChatMessages,
};
