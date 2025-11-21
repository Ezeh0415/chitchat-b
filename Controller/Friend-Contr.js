const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const client = require("../Models/Redis");
const { getIO } = require("../Models/Socket");

const getRegisterdUser = async (req, res) => {
  const USERS_CACHE_KEY = "users:list";
  try {
    const db = getDB();
    const cached = await client.json.get(USERS_CACHE_KEY);
    if (cached) {
      return res.status(200).json({
        data: cached,
      });
    }

    const userCount = await db.collection("users").countDocuments();

    const users = await db
      .collection("users")
      .find(
        {},
        {
          projection: {
            _id: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            profileImage: 1,
          },
        }
      )
      .sort({ email: 1 })
      .toArray();

    // Save structured JSON to Redis (no manual stringify needed)
    await client.json.set(USERS_CACHE_KEY, "$", users);

    // Set expiration (TTL) to 5 minutes
    await client.expire(USERS_CACHE_KEY, 300);

    res.status(200).json({
      totalCount: userCount,
      data: users,
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    handleError(res, error, "Failed to fetch users");
  }
};
const AddFriends = async (req, res) => {
  const { AdderEmail, ReciverEmail } = req.body;

  if (!AdderEmail || !ReciverEmail) {
    return handleError(res, null, "Email must not be empty", 400);
  }

  try {
    const db = getDB();
    const id = new ObjectId();
    const now = new Date();

    // Check if friend request already exists first
    const existedRequest = await db.collection("users").findOne({
      email: ReciverEmail,
      "FriendRequest.email": AdderEmail,
    });

    if (existedRequest) {
      return handleError(res, null, "Friend request sent before", 409);
    }

    // Try to get user from Redis first
    const usersList = await client.json.get("users:list");
    let adderUser = usersList?.find((user) => user.email === AdderEmail);

    if (!adderUser) {
      console.log("⚙️ User not found in cache → fallback to MongoDB");
      adderUser = await db.collection("users").findOne({ email: AdderEmail });

      if (!adderUser) {
        return handleError(res, null, "Adder user not found", 404);
      }

      // Update Redis cache if user found in MongoDB
      if (usersList) {
        usersList.push(adderUser);
        await client.json.set("users:list", "$", usersList);
        await client.expire("users:list", 600); // 10 minutes TTL
      }
    }

    console.log("📦 Processing friend request");

    // Create friend request and notification objects
    const friendRequest = {
      _id: id,
      firstName: adderUser.firstName,
      lastName: adderUser.lastName,
      email: adderUser.email,
      profileImage: adderUser.profileImage,
      createdAt: now,
    };

    const notification = {
      _id: id,
      firstName: adderUser.firstName,
      lastName: adderUser.lastName,
      profileImage: adderUser.profileImage,
      createdAt: now,
      read: false,
    };

    // Update Receiver with friend request and notification
    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $push: {
          FriendRequest: { $each: [friendRequest] },
          notifications: {
            $each: [
              {
                ...notification,
                userDid: `friend request was sent from ${adderUser.firstName} `,
              },
            ],
          },
        },
      }
    );

    // Update Adder with notification only
    await db.collection("users").updateOne(
      { email: AdderEmail },
      {
        $addToSet: {
          notifications: {
            ...notification,
            userDid: "you sent a friend request",
          },
        },
      }
    );

    return res.status(200).json({
      message: "Friend request sent successfully",
    });
  } catch (error) {
    console.error("❌ AddFriends error:", error);
    handleError(res, error, "Friend request was unsuccessful");
  }
};

const FriendRequests = async (req, res) => {
  const userId = req.params.id;

  if (!ObjectId.isValid(userId)) {
    return handleError(res, null, "invalid user id", 400);
  }

  try {
    const db = getDB();

    const redisKey = `friendRequests:${new ObjectId(userId)}`;

    const usersList = await client.json.get(redisKey);

    if (usersList) {
      console.log(User?.FriendRequest || []);
      return res.status(200).json({ data: User.FriendRequest || [] });
    }

    const User = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });

    if (!User) {
      return handleError(res, null, "User not found", 404);
    }

    console.log(User?.FriendRequest || []);

    return res.status(200).json({ data: User.FriendRequest || [] });
  } catch (error) {
    handleError(res, error, "unable to get friend requests from database");
  }
};

const AcceptFriendRequests = async (req, res) => {
  const { usersEmail, ReciverEmail } = req.body;
  const requestId = req.params.id;

  if (!usersEmail || !ReciverEmail || !ObjectId.isValid(requestId)) {
    return handleError(res, null, "Email(s) or ID must be valid", 400);
  }

  const requestObjectId = new ObjectId(requestId);

  try {
    const db = getDB();
    const now = new Date();
    const id = new ObjectId();

    // Redis keys
    const userRedisKey = `user:${usersEmail}`;
    const friendRedisKey = `user:${ReciverEmail}`;
    const friendRequestsKey = `friendRequests:${requestObjectId}`;

    // Try getting users from Redis first
    const [cachedUser, cachedFriend] = await Promise.all([
      client.json.get(userRedisKey),
      client.json.get(friendRedisKey),
    ]);

    // Get users from MongoDB if not in cache
    const friendsRequest =
      cachedFriend ||
      (await db.collection("users").findOne({ email: ReciverEmail }));

    const userEmail =
      cachedUser ||
      (await db
        .collection("users")
        .findOne({ email: usersEmail, "FriendRequest._id": requestObjectId }));

    if (!friendsRequest || !userEmail) {
      return handleError(
        res,
        null,
        "Could not fetch the friend request from the database",
        500
      );
    }

    // Cache users if found from MongoDB
    if (!cachedUser && userEmail) {
      await client.json.set(userRedisKey, "$", userEmail);
      await client.expire(userRedisKey, 3600); // 1 hour TTL
    }
    if (!cachedFriend && friendsRequest) {
      await client.json.set(friendRedisKey, "$", friendsRequest);
      await client.expire(friendRedisKey, 3600);
    }

    // Create friend and notification objects
    const friendData = {
      _id: id,
      email: friendsRequest.email,
      firstName: friendsRequest.firstName,
      lastName: friendsRequest.lastName,
      profileImage: friendsRequest.profileImage,
      createdAt: now,
      chats: [], // Initialize empty chats array
    };

    const notificationData = {
      _id: id,
      email: friendsRequest.email,
      firstName: friendsRequest.firstName,
      lastName: friendsRequest.lastName,
      profileImage: friendsRequest.profileImage,
      userDid: "accepted your friend request",
      createdAt: now,
      read: false,
    };

    // Update both users in parallel
    await Promise.all([
      // Update user
      db.collection("users").updateOne(
        { email: usersEmail },
        {
          $addToSet: {
            Friends: friendData,
            notifications: notificationData,
          },
        }
      ),
      // Update friend
      db.collection("users").updateOne(
        { email: ReciverEmail },
        {
          $addToSet: {
            Friends: {
              ...friendData,
              email: userEmail.email,
              firstName: userEmail.firstName,
              lastName: userEmail.lastName,
              profileImage: userEmail.profileImage,
            },
            notifications: {
              ...notificationData,
              email: userEmail.email,
              firstName: userEmail.firstName,
              lastName: userEmail.lastName,
              profileImage: userEmail.profileImage,
            },
          },
        }
      ),
      // Clean up friend request
      db.collection("users").findOneAndUpdate(
        {
          email: usersEmail,
          "notifications._id": requestObjectId,
        },
        {
          $pull: { FriendRequest: { _id: requestObjectId } },
          $set: { "notifications.$.read": true },
        }
      ),
      // Mark notifications as read
      db.collection("users").findOneAndUpdate(
        {
          email: ReciverEmail,
          "notifications._id": requestObjectId,
        },
        { $set: { "notifications.$.read": true } }
      ),
    ]);

    // Invalidate relevant Redis cache
    await Promise.all([
      client.del(userRedisKey),
      client.del(friendRedisKey),
      client.del(friendRequestsKey),
    ]);

    return res.status(200).json({
      message: "Friend request accepted successfully",
      friendId: id,
    });
  } catch (error) {
    console.error("❌ AcceptFriendRequest error:", error);
    return handleError(res, error, "Failed to accept friend request", 404);
  }
};

const Unfriend = async (req, res) => {
  const { userEmail, ReciverEmail } = req.body;
  const friendId = req.params.id;

  if (!userEmail || !ReciverEmail || !ObjectId.isValid(friendId)) {
    return handleError(res, null, "Email(s) or ID must be valid", 400);
  }

  const friendObjectId = new ObjectId(friendId);
  const io = getIO();

  try {
    const db = getDB();

    const userRedisKey = `user:${userEmail}`;
    const friendRedisKey = `user:${ReciverEmail}`;

    // ✅ 1️⃣ Update both users’ friend lists in DB
    const [userUpdate, friendUpdate] = await Promise.all([
      db
        .collection("users")
        .findOneAndUpdate(
          { email: userEmail },
          { $pull: { Friends: { _id: friendObjectId } } },
          { returnDocument: "after" }
        ),
      db
        .collection("users")
        .findOneAndUpdate(
          { email: ReciverEmail },
          { $pull: { Friends: { _id: friendObjectId } } },
          { returnDocument: "after" }
        ),
    ]);

    // ✅ 2️⃣ Update Redis cache for both users (instead of just deleting)
    await Promise.all([
      client.json.set(userRedisKey, "$", userUpdate.value),
      client.expire(userRedisKey, 600), // 10 min TTL

      client.json.set(friendRedisKey, "$", friendUpdate.value),
      client.expire(friendRedisKey, 600),
    ]);

    // ✅ 3️⃣ Emit real-time events for live UI updates
    io.to(userEmail).emit("friendRemoved", {
      message: `You unfriended ${ReciverEmail}`,
      updatedUser: userUpdate.value,
    });

    io.to(ReciverEmail).emit("friendRemoved", {
      message: `${userEmail} unfriended you`,
      updatedUser: friendUpdate.value,
    });

    console.log(`✅ Unfriended: ${userEmail} and ${ReciverEmail}`);

    return res.status(200).json({
      message: "Unfriended successfully",
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("❌ Unfriend error:", error);
    return handleError(res, error, "Failed to unfriend", 500);
  }
};

const DeleteFriendRequests = async (req, res) => {
  const { email } = req.body;
  const requestId = req.params.id;

  if (!email || !ObjectId.isValid(requestId)) {
    return handleError(res, null, "Your email or request ID is invalid", 400);
  }

  const requestObjectId = new ObjectId(requestId);

  try {
    const db = getDB();
    const userRedisKey = `user:${email}`;
    const requestRedisKey = `friendRequest:${requestId}`;

    // Perform MongoDB updates in parallel
    const [friendRequestResult, notificationResult] = await Promise.all([
      db.collection("users").findOneAndUpdate(
        { email, "FriendRequest._id": requestObjectId },
        {
          $pull: { FriendRequest: { _id: requestObjectId } },
        },
        { returnDocument: "after" }
      ),
      db.collection("users").findOneAndUpdate(
        { email, "notifications._id": requestObjectId },
        {
          $pull: { notifications: { _id: requestObjectId } },
        },
        { returnDocument: "after" }
      ),
    ]);

    if (!friendRequestResult.value || !notificationResult.value) {
      return handleError(res, null, "Friend request not found", 404);
    }

    // Invalidate related Redis cache
    await Promise.all([client.del(userRedisKey), client.del(requestRedisKey)]);

    console.log(
      `✅ Successfully deleted friend request: ${requestId} for user: ${email}`
    );

    return res.status(200).json({
      message: "Friend request deleted successfully",
      deletedAt: new Date(),
    });
  } catch (error) {
    console.error("❌ DeleteFriendRequests error:", error);
    return handleError(res, error, "Failed to delete friend request", 500);
  }
};
module.exports = {
  getRegisterdUser,
  AddFriends,
  FriendRequests,
  AcceptFriendRequests,
  Unfriend,
  DeleteFriendRequests,
};
