const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");

const getRegisterdUser = async (req, res) => {
  try {
    const db = getDB();

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
    return handleError(res, null, "email must not be empty", 400);
  }

  try {
    const db = getDB();

    const adderUsers = await db
      .collection("users")
      .findOne({ email: AdderEmail });

    if (!adderUsers) {
      return handleError(res, null, "Adder user not found", 404);
    }

    const existedRequest = await db.collection("users").findOne({
      email: ReciverEmail,
      "FriendRequest.email": AdderEmail,
    });

    if (existedRequest) {
      return handleError(res, null, "friend request sent before", 404);
    }
    console.log(existedRequest);

    const id = new ObjectId();

    // rest of the logic that uses adderUser safely

    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $addToSet: {
          FriendRequest: {
            _id: id,
            firstName: adderUsers.firstName,
            lastName: adderUsers.lastName,
            email: adderUsers.email,
            profileImage: adderUsers.profileImage,
            createdAt: new Date(),
          },
        },
      }
    );

    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $addToSet: {
          FriendRequestsNotifications: {
            _id: id,
            firstName: adderUsers.firstName,
            lastName: adderUsers.lastName,
            profileImage: adderUsers.profileImage,
            userDid: "sent you a friend request",
            createdAt: new Date(),
            read: false,
          },
        },
      }
    );

    await db.collection("users").updateOne(
      { email: AdderEmail },
      {
        $addToSet: {
          FriendRequestsNotifications: {
            _id: id,
            firstName: adderUsers.firstName,
            lastName: adderUsers.lastName,
            profileImage: adderUsers.profileImage,
            userDid: " you sent a friend request",
            createdAt: new Date(),
            read: false,
          },
        },
      }
    );

    return res.status(200).json({
      message: "friend request sent successfully",
    });
  } catch (error) {
    handleError(res, error, "friend request was unsuccessfull");
  }
};

const FriendRequests = async (req, res) => {
  const userId = req.params.id;

  if (!ObjectId.isValid(userId)) {
    return handleError(res, null, "invalid user id", 400);
  }

  try {
    const db = getDB();

    const User = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });

    if (!User) {
      return handleError(res, null, "User not found", 404);
    }

    res.status(200).json({ data: User.FriendRequest || [] });
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

  console.log(requestId);

  const requestObjectId = new ObjectId(requestId);

  try {
    const db = getDB();
    const friendsRequest = await db
      .collection("users")
      .findOne({ email: ReciverEmail });

    const userEmail = await db
      .collection("users")
      .findOne({ email: usersEmail, "FriendRequest._id": requestObjectId });

    if (!friendsRequest || !userEmail) {
      return handleError(
        res,
        null,
        "could not fetch the friend request from the database",
        500
      );
    }
    const id = new ObjectId();

    await db.collection("users").updateOne(
      { email: usersEmail },
      {
        $addToSet: {
          Friends: {
            _id: id,
            email: friendsRequest.email,
            firstName: friendsRequest.firstName,
            lastName: friendsRequest.lastName,
            profileImage: friendsRequest.profileImage,
            createdAt: new Date(),
          },
        },
      }
    );

    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $addToSet: {
          Friends: {
            _id: id,
            email: userEmail.email,
            firstName: userEmail.firstName,
            lastName: userEmail.lastName,
            profileImage: userEmail.profileImage,
            createdAt: new Date(),
          },
        },
      }
    );

    await db.collection("users").updateOne(
      { email: usersEmail },
      {
        $addToSet: {
          FriendRequestsNotifications: {
            _id: id,
            email: friendsRequest.email,
            firstName: friendsRequest.firstName,
            lastName: friendsRequest.lastName,
            profileImage: friendsRequest.profileImage,
            userDid: " accepted your friend request",
            createdAt: new Date(),
            read: false,
          },
        },
      }
    );

    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $addToSet: {
          FriendRequestsNotifications: {
            _id: id,
            email: userEmail.email,
            firstName: userEmail.firstName,
            lastName: userEmail.lastName,
            profileImage: userEmail.profileImage,
            userDid: " accepted your friend request",
            createdAt: new Date(),
            read: false,
          },
        },
      }
    );

    await db.collection("users").findOneAndUpdate(
      { email: usersEmail, "FriendRequest._id": requestObjectId },
      {
        $pull: { FriendRequest: { _id: requestObjectId } },
      },
      { returnDocument: "after" }
    );

    await db.collection("users").findOneAndUpdate(
      { email: usersEmail, "FriendRequestsNotifications._id": requestObjectId },
      {
        $set: { "FriendRequestsNotifications.$.read": true },
      },
      { returnDocument: "after" }
    );

    await db.collection("users").findOneAndUpdate(
      {
        email: ReciverEmail,
        "FriendRequestsNotifications._id": requestObjectId,
      },
      {
        $set: { "FriendRequestsNotifications.$.read": true },
      },
      { returnDocument: "after" }
    );

    res.status(200).json({ message: "friend request accepted " });
  } catch (error) {
    handleError(res, error, "failed to accept friend request", 404);
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

    await db.collection("users").findOneAndUpdate(
      { email, "FriendRequest._id": requestObjectId },
      {
        $pull: { FriendRequest: { _id: requestObjectId } },
      },
      { returnDocument: "after" }
    );

    await db.collection("users").findOneAndUpdate(
      { email, "FriendRequestsNotifications._id": requestObjectId },
      {
        $pull: { FriendRequestsNotifications: { _id: requestObjectId } },
      },
      { returnDocument: "after" }
    );

    res.status(200).json({
      message: "Friend request deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete friend request", 500);
  }
};
module.exports = {
  getRegisterdUser,
  AddFriends,
  FriendRequests,
  AcceptFriendRequests,
  DeleteFriendRequests,
};
