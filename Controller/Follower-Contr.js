const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const client = require("../Models/Redis");
const e = require("cors");

const follow = async (req, res) => {
  const { userEmail, followerEmail } = req.body;

  if (!userEmail || !followerEmail) {
    handleError(res, 400, "Missing parameters");
    return;
  }

  const Follower = {
    FollowerEmail: followerEmail,
    UserEmail: userEmail,
    isFollowed: true,
    _id: new ObjectId(),
  };

  if (followerEmail === userEmail) {
    return handleError(res, 400, "Can't follow yourself");
  }

  try {
    const db = getDB();

    const isFollowed = await db.collection("users").findOne(
      {
        email: userEmail,
        "following.FollowerEmail": followerEmail,
      },
      {
        projection: { "following.$": 1 },
      }
    );

    if (isFollowed) {
      return handleError(res, 400, "Already followed");
    }

    await db
      .collection("users")
      .updateOne({ email: userEmail }, { $addToSet: { following: Follower } });
    await db
      .collection("users")
      .updateOne(
        { email: followerEmail },
        { $addToSet: { followers: Follower } }
      );

    res.status(200).json({ message: "Followed" });
  } catch (err) {
    handleError(res, 500, err);
    handleError(res, 500, "Error while following");
  }
};

const unfollow = async (req, res) => {
  const { userEmail, followerEmail } = req.body;

  if (!userEmail || !followerEmail) {
    return handleError(res, 400, "Missing parameters");
  }
  try {
    const db = getDB();

    const isFollowed = await db.collection("users").findOne(
      {
        email: userEmail,
        "following.FollowerEmail": followerEmail,
      },
      {
        projection: { "following.$": 1 },
      }
    );

    if (!isFollowed) {
      return handleError(res, 400, "Not followed");
    }

    await db
      .collection("users")
      .updateOne(
        { email: userEmail },
        { $pull: { following: { FollowerEmail: followerEmail } } }
      );
    await db
      .collection("users")
      .updateOne(
        { email: followerEmail },
        { $pull: { followers: { FollowerEmail: userEmail } } }
      );
    res.status(200).json({ message: "Unfollowed" });
  } catch (error) {
    handleError(res, 500, error);
  }
};

module.exports = {
  follow,
  unfollow,
};
