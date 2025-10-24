const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const cloudinary = require("../Utils/Cloudinary");
const { getIO } = require("../Models/Socket"); // Import io from server.js

const PostWithImage = async (req, res) => {
  const { email, title, postText, media } = req.body;

  if (!email) {
    return handleError(
      res,
      null,
      "Email, postText and title are required",
      400
    );
  }

  if (media) {
    try {
      const db = getDB();
      const user = await db.collection("users").findOne({ email });
      if (!user) {
        return handleError(res, null, "User not found", 404);
      }

      if (!media) {
        return handleError(res, null, "no media provided", 404);
      }

      const matches = media.match(/^data:(.*);base64,/);
      if (!matches || matches.length !== 2) {
        return handleError(res, null, "Invalid media format", 400);
      }

      const mimeType = matches[1];

      const allowedType = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
        "video/mp4",
        "video/webm",
        "video/ogg",
      ];

      if (!allowedType.includes(mimeType.toLowerCase())) {
        return handleError(
          res,
          null,
          "Only image and video files are allowed",
          400
        );
      }

      const uploadResult = await cloudinary.uploader.upload(media, {
        folder: "profile_media",
        resource_type: "auto",
      });

      let mediaType;

      if (mimeType.startsWith("image")) {
        mediaType = "image";
      } else if (mimeType.startsWith("video")) {
        mediaType = "video";
      } else {
        return res.status(400).json({ error: "Unsupported media type" });
      }

      const postId = new ObjectId();

      const UserPost = {
        _id: postId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        mediaUrl: uploadResult.secure_url,
        mediaType: mediaType,
        title: title,
        postText: postText,
        liked: [],
        comments: [],
        createdAt: new Date(),
      };

      await db.collection("users").updateOne(
        { email },
        {
          $addToSet: {
            posts: UserPost,
          },
        },
        { returnDocument: "after" }
      );

      await db.collection("posts").insertOne(UserPost);

      return res.status(200).json({
        message: "Media uploaded successfully",
        mediaType: mediaType,
        mediaUrl: uploadResult.secure_url,
      });
    } catch (error) {
      console.error("Profile media upload error:", error);
      return handleError(res, error, "Failed to upload media", 500);
    }
  } else {
    try {
      const db = getDB();
      const user = await db.collection("users").findOne({ email });
      if (!user) {
        return handleError(res, null, "User not found", 404);
      }

      const postId = new ObjectId();

      const userPost = {
        _id: postId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        title: title,
        postText: postText,
        liked: [],
        comments: [],
        createdAt: new Date(),
      };

      await db.collection("users").updateOne(
        { email },
        {
          $addToSet: {
            posts: userPost,
          },
        },
        { returnDocument: "after" }
      );

      await db.collection("posts").insertOne(userPost);

      return res.status(200).json({
        message: "Media uploaded successfully",
      });
    } catch (error) {
      console.error("post upload error:", error);
      return handleError(res, error, "Failed to upload post", 500);
    }
  }
};

const postDisplay = async (req, res) => {
  const { email, postId, notif_id } = req.body;
  const io = getIO();

  if (!email || !postId) {
    io?.emit(
      "postDisplay",
      "Emails and Post ID are required to display a post"
    );
    return handleError(res, null, "Required fields are missing", 400);
  }

  try {
    const db = getDB();

    const post = await db
      .collection("posts")
      .findOne({ _id: new ObjectId(postId) });

    if (notif_id) {
      await db.collection("users").updateOne(
        {
          email,
          "notifications.notif_id": new ObjectId(notif_id),
        },
        {
          $set: {
            "notifications.$.read": true, // or any field you want to change
          },
        }
      );
    }

    if (!post) {
      io?.emit("postDisplay", "post not found");
      return handleError(res, null, "post not found", 404);
    }

    return res.status(200).json({ post: post });
  } catch (error) {
    console.error("post display unSuccessfull:", error);
    return handleError(
      res,
      error,
      "Failed to display post / update notification. Try again.",
      500
    );
  }
};

const notifclear = async (req, res) => {
  const { email, notif_id } = req.body;

  if (!email || !notif_id) {
    return handleError(
      res,
      null,
      "Email and Notification ID are required",
      400
    );
  }
  try {
    const db = getDB();
    await db.collection("users").updateOne(
      {
        email,
        "FriendRequestsNotifications._id": new ObjectId(notif_id),
      },
      {
        $set: {
          "FriendRequestsNotifications.$.read": true, // or any field you want to change
        },
      }
    );
    return res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Notification update unsuccessful:", error);
    return handleError(
      res,
      error,
      "Failed to update notification. Try again.",
      500
    );
  }
};

const LikedPosts = async (req, res) => {
  const { posterEmail, likerId, postId } = req.body;
  const io = getIO();

  if (!posterEmail || !likerId || !postId) {
    io?.emit("likedError", "Emails and Post ID are required to like a post");
    return handleError(res, null, "Required fields are missing", 400);
  }

  try {
    const db = getDB();

    const likedUser = await db
      .collection("users")
      .findOne({ _id: new ObjectId(likerId) });
    const posterUser = await db
      .collection("users")
      .findOne({ email: posterEmail });

    if (!posterUser || !likedUser) {
      io?.emit("likedError", "Users not found");
      return handleError(res, null, "Users not found", 404);
    }

    if (posterEmail === likedUser.email) {
      io?.emit("likedError", "You cannot like your own post");
      return handleError(res, null, "You cannot like your own post", 409);
    }

    const id = new ObjectId();

    const liked = {
      _id: id,
      postOwnerEmail: posterUser.email,
      likedByEmail: likedUser.email,
      likedByFirstName: likedUser.firstName,
      likedByLastName: likedUser.lastName,
      profileImage: likedUser.profileImage,
      createdAt: new Date(),
    };

    // Update likes in poster's user posts
    await db.collection("users").updateOne(
      {
        email: posterEmail,
        "posts._id": new ObjectId(postId),
      },
      {
        $addToSet: { "posts.$.liked": liked },
      }
    );

    //     // // Optional: if you also store posts in a separate collection
    await db
      .collection("posts")
      .updateOne(
        { _id: new ObjectId(postId) },
        { $addToSet: { liked: liked } }
      );

    const post = posterUser.posts.find(
      (post) => post._id && post._id.toString() === postId
    );

    await db.collection("users").updateOne(
      { email: posterEmail },
      {
        $addToSet: {
          notifications: {
            notif_id: new ObjectId(),
            post_id: postId,
            postOwnerEmail: posterUser.email,
            firstName: likedUser.firstName,
            lastName: likedUser.lastName,
            profileImage: likedUser.profileImage,
            title: post.title,
            userDid: "liked this post",
            read: false,
            createdAt: new Date(),
          },
        },
      }
    );

    io?.emit("postLiked", {
      postId,
      likedBy: likedUser.email,
      postOwner: posterUser.email,
    });

    return res.status(200).json({ message: "Liked successfully" });
  } catch (error) {
    console.error("Like unsuccessful:", error);
    return handleError(res, error, "Failed to like post. Try again.", 500);
  }
};

const UnlikePost = async (req, res) => {
  const { posterEmail, likerId, postId } = req.body;
  const io = getIO();

  if (!posterEmail || !likerId || !postId) {
    io?.emit("unlikeError", "Emails and Post ID are required to unlike a post");
    return handleError(res, null, "Required fields are missing", 400);
  }

  if (posterEmail === likerId) {
    io?.emit("unlikeError", "You cannot unlike your own post");
    return handleError(res, null, "You cannot unlike your own post", 409);
  }

  try {
    const db = getDB();

    const likedUser = await db
      .collection("users")
      .findOne({ _id: new ObjectId(likerId) });
    const posterUser = await db
      .collection("users")
      .findOne({ email: posterEmail });

    if (!posterUser || !likedUser) {
      io?.emit("unlikeError", "Users not found");
      return handleError(res, null, "Users not found", 404);
    }

    // Remove like from poster's posts array
    await db.collection("users").updateOne(
      {
        email: posterEmail,
        "posts._id": new ObjectId(postId),
      },
      {
        $pull: {
          "posts.$.liked": { likedByEmail: likedUser.email },
        },
      }
    );

    // Remove like from posts collection
    await db.collection("posts").updateOne(
      { _id: new ObjectId(postId) },
      {
        $pull: { liked: { likedByEmail: likedUser.email } },
      }
    );

    io?.emit("postUnliked", {
      postId,
      unlikedBy: likedUser.email,
      postOwner: posterUser.email,
    });

    return res.status(200).json({ message: "Unliked successfully" });
  } catch (error) {
    console.error("Unlike unsuccessful:", error);
    return handleError(res, error, "Failed to unlike post. Try again.", 500);
  }
};

const MAX_COMMENT_LENGTH = 500;
const COMMENT_COOLDOWN_SECONDS = 10; // basic rate limit

const CommentOnPost = async (req, res) => {
  const { PostEmail, postId, commentedUser, commentText } = req.body;

  if (!PostEmail || !postId || !commentedUser || !commentText) {
    return handleError(res, null, "Missing required data", 400);
  }

  const trimmedComment = commentText.trim();
  if (
    trimmedComment.length === 0 ||
    trimmedComment.length > MAX_COMMENT_LENGTH
  ) {
    return handleError(
      res,
      null,
      `Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`,
      400
    );
  }

  try {
    const db = getDB();

    const userDoc = await db.collection("users").findOne({
      email: PostEmail,
      "posts._id": new ObjectId(postId),
    });

    const commnterEmail = await db.collection("users").findOne({
      email: commentedUser,
    });
    // console.log(commnterEmail);

    if (!userDoc || !commnterEmail) {
      return handleError(res, null, "Post not found", 404);
    }

    const post = userDoc.posts.find(
      (post) => post._id && post._id.toString() === postId
    );

    // console.log(post);

    if (!post) {
      return handleError(res, null, "Post not found in user's posts", 404);
    }

    const lastComment = post.comments?.slice(-1)[0];
    const now = new Date();

    if (
      lastComment &&
      lastComment.createdAt &&
      commentedUser.email === lastComment.email
    ) {
      const lastTime = new Date(lastComment.createdAt);
      const secondsSinceLast = (now - lastTime) / 1000;

      if (secondsSinceLast < COMMENT_COOLDOWN_SECONDS) {
        return handleError(
          res,
          null,
          `You're commenting too fast. Please wait a few seconds.`,
          429
        );
      }
    }

    const comment = {
      _id: new ObjectId(),
      firstName: commnterEmail.firstName,
      lastName: commnterEmail.lastName,
      email: commnterEmail.email,
      profileImage: commnterEmail.profileImage,
      commentText: trimmedComment,
      createdAt: now,
    };

    // Add comment to embedded post in user's document
    await db.collection("users").updateOne(
      {
        email: PostEmail,
        "posts._id": new ObjectId(postId),
      },
      {
        $addToSet: { "posts.$.comments": comment },
      }
    );

    // Update the global posts collection
    await db
      .collection("posts")
      .updateOne(
        { _id: new ObjectId(postId) },
        { $addToSet: { comments: comment } }
      );

    // Notify post owner
    await db.collection("users").updateOne(
      { email: PostEmail },
      {
        $addToSet: {
          notifications: {
            notif_id: new ObjectId(),
            post_id: postId,
            postOwnerEmail: userDoc.email,
            firstName: commnterEmail.firstName,
            lastName: commnterEmail.lastName,
            profileImage: commnterEmail.profileImage,
            postId: postId,
            title: post.title,
            userDid: "commented on your post",
            createdAt: now,
          },
        },
      }
    );

    return res.status(200).json({
      message: "Comment added successfully",
      commentId: comment._id,
    });
  } catch (error) {
    console.error("Commenting failed:", error);
    return handleError(res, error, "Failed to add comment", 500);
  }
};

const activePosts = async (req, res) => {
  try {
    const db = getDB();

    const postCount = await db.collection("posts").countDocuments();
    const post = await db.collection("posts").find().toArray();

    const posts = await db
      .collection("posts")
      .find(
        {},
        {
          projection: {
            _id: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            profileImage: 1,
            mediaUrl: 1,
            mediaType: 1,
            title: 1,
            postText: 1,
            createdAt: 1,
            liked: 1,
            comments: 1,
          },
        }
      )
      .sort({ _id: -1 })
      .toArray();

    res.status(200).json({
      totalCount: postCount,
      data: posts,
      objData: post,
    });
  } catch (error) {
    console.error("GET /api/posts error:", error);
    handleError(res, error, "Failed to fetch posts");
  }
};

module.exports = {
  PostWithImage,
  UnlikePost,
  activePosts,
  LikedPosts,
  CommentOnPost,
  postDisplay,
  notifclear,
};
