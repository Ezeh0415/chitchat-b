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

    // rest of the logic that uses adderUser safely

    await db.collection("users").updateOne(
      { email: ReciverEmail },
      {
        $addToSet: {
          FriendRequest: {
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
          Notifications: {
            firstName: adderUsers.firstName,
            lastName: adderUsers.lastName,
            profileImage: adderUsers.profileImage,
            userDid: "sent you a friend request",
            createdAt: new Date(),
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
  const { usersEmail } = req.body;
  const requestId = req.params.id;

  if (!usersEmail || !ObjectId.isValid(requestId)) {
    return handleError(res, null, "email or id must be valid ", 400);
  }

  try {
    const db = getDB();
    const friendsRequest = await db
      .collection("users")
      .findOne({ _id: new ObjectId(requestId) });

    const userEmail = await db
      .collection("users")
      .findOne({ email: usersEmail });

    if (!friendsRequest) {
      return handleError(
        res,
        null,
        "could not fetch the friend request from the database",
        500
      );
    }

    await db.collection("users").updateOne(
      { email: usersEmail },
      {
        $addToSet: {
          Friends: {
            firstName: friendsRequest.firstName,
            lastName: friendsRequest.lastName,
            profileImage: friendsRequest.profileImage,
            createdAt: new Date(),
          },
        },
      }
    );

    await db
      .collection("users")
      .findOneAndUpdate(
        { email: usersEmail },
        { $pull: { FriendRequest: { id: requestId } } },
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
    return handleError(res, null, "your email or id can not be empty", 400);
  }

  try {
    const db = getDB();

    await db
      .collection("users")
      .findOneAndUpdate(
        { email },
        { $pull: { FriendRequest: { id: requestId } } },
        { returnDocument: "after" }
      );

    res.status(200).json({ message: "friend request deleted successfully" });
  } catch (error) {
    handleError(res, error, "failed to delete friend request", 500);
  }
};

module.exports = {
  getRegisterdUser,
  AddFriends,
  FriendRequests,
  AcceptFriendRequests,
  DeleteFriendRequests,
};
