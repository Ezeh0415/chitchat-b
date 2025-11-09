const { ObjectId } = require("mongodb");
const { getDB } = require("../Models/Db");
const { handleError } = require("../Utils/ErrorHandler");
const cloudinary = require("../Utils/Cloudinary");
const { getIO } = require("../Models/Socket");
const client = require("../Models/Redis"); // Import io from server.js

const PostWithImage = async (req, res) => {
  const { email, title, postText, media } = req.body;

  if (!email || !title) {
    return handleError(
      res,
      null,
      "Email, postText and title are required",
      400
    );
  }

  try {
    const db = getDB();
    const userCacheKey = `user:${email}`;

    // Try to get user from Redis first
    let user = await client.json.get(userCacheKey);

    if (!user) {
      user = await db.collection("users").findOne({ email });
      if (!user) {
        return handleError(res, null, "User not found", 404);
      }
      // Cache user data
      await client.json.set(userCacheKey, "$", user);
      await client.expire(userCacheKey, 3600); // 1 hour TTL
    }

    const postId = new ObjectId();
    const now = new Date();

    if (media) {
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

      const mediaType = mimeType.startsWith("image")
        ? "image"
        : mimeType.startsWith("video")
        ? "video"
        : null;

      if (!mediaType) {
        return handleError(res, null, "Unsupported media type", 400);
      }

      const userPost = {
        _id: postId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        mediaUrl: uploadResult.secure_url,
        mediaType,
        title,
        postText,
        liked: [],
        comments: [],
        createdAt: now,
      };

      // Update MongoDB
      const [userUpdate, globalPost] = await Promise.all([
        db
          .collection("users")
          .updateOne({ email }, { $addToSet: { posts: userPost } }),
        db.collection("posts").insertOne(userPost),
      ]);

      // Invalidate relevant Redis cache
      const cacheKeys = [
        `user:${email}:posts`,
        `posts:recent`,
        `posts:page:1:limit:10`, // Assuming this is your default pagination
      ];

      await Promise.all(cacheKeys.map((key) => client.del(key)));

      return res.status(200).json({
        message: "Media uploaded successfully",
        mediaType,
        mediaUrl: uploadResult.secure_url,
        postId: postId.toString(),
      });
    } else {
      const userPost = {
        _id: postId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        title,
        postText,
        liked: [],
        comments: [],
        createdAt: now,
      };

      // Update MongoDB
      const [userUpdate, globalPost] = await Promise.all([
        db
          .collection("users")
          .updateOne({ email }, { $addToSet: { posts: userPost } }),
        db.collection("posts").insertOne(userPost),
      ]);

      // Invalidate relevant Redis cache
      const cacheKeys = [
        `user:${email}:posts`,
        `posts:recent`,
        `posts:page:1:limit:10`,
      ];

      await Promise.all(cacheKeys.map((key) => client.del(key)));

      return res.status(200).json({
        message: "Post created successfully",
        postId: postId.toString(),
      });
    }
  } catch (error) {
    console.error("❌ Post creation error:", error);
    return handleError(res, error, "Failed to create post", 500);
  }
};

const postDisplay = async (req, res) => {
  const { email, postId, notif_id } = req.body;
  const io = getIO();

  if (!email || !postId || !ObjectId.isValid(postId)) {
    io?.emit("postDisplay", "Valid email and post ID are required");
    return handleError(
      res,
      null,
      "Required fields are missing or invalid",
      400
    );
  }

  try {
    const db = getDB();
    const postCacheKey = `post:${postId}`;

    // Try to get post from Redis first
    let post = await client.json.get(postCacheKey);
    let fromCache = false;

    if (post) {
      fromCache = true;
    } else {
      // Get from MongoDB if not in cache
      post = await db.collection("posts").findOne({
        _id: new ObjectId(postId),
      });

      if (post) {
        // Cache the post for future requests
        await client.json.set(postCacheKey, "$", post);
        await client.expire(postCacheKey, 3600); // 1 hour TTL
      }
    }

    // Handle notification update if needed
    if (notif_id && ObjectId.isValid(notif_id)) {
      const notifUpdate = await db.collection("users").updateOne(
        {
          email,
          "notifications.notif_id": new ObjectId(notif_id),
        },
        {
          $set: {
            "notifications.$.read": true,
          },
        }
      );

      if (notifUpdate.modifiedCount === 0) {
        console.warn(`⚠️ No notification updated for ID: ${notif_id}`);
      }
    }

    if (!post) {
      io?.emit("postDisplay", "Post not found");
      return handleError(res, null, "Post not found", 404);
    }

    return res.status(200).json({
      post,
      source: fromCache ? "cache" : "database",
    });
  } catch (error) {
    console.error("❌ Post display error:", error);
    return handleError(
      res,
      error,
      "Failed to display post / update notification",
      500
    );
  }
};
// ...existing code...
const notifclear = async (req, res) => {
  const { email, notif_id } = req.body;

  if (!email || !notif_id || !ObjectId.isValid(notif_id)) {
    return handleError(
      res,
      null,
      "Email and valid Notification ID are required",
      400
    );
  }

  const notifObjectId = new ObjectId(notif_id);

  try {
    const db = getDB();
    const userRedisKey = `user:${email}`;
    const notificationRedisKey = `notification:${notif_id}`;

    const result = await db.collection("users").updateOne(
      {
        email,
        "FriendRequestsNotifications._id": notifObjectId,
      },
      {
        $set: {
          "FriendRequestsNotifications.$.read": true,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return handleError(res, null, "Notification not found", 404);
    }

    // Invalidate related Redis cache (do in parallel)
    await Promise.all([
      client.del(userRedisKey),
      client.del(notificationRedisKey),
    ]);

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
// ...existing code...

const cacheUserKey = (email) => `user:${email}`;
const cachePostKey = (postId) => `post:${postId}`;

const LikedPosts = async (req, res) => {
  const { posterEmail, likerId, postId } = req.body;
  const io = getIO();

  if (!posterEmail || !likerId || !postId) {
    io?.emit("likedError", "Emails and Post ID are required to like a post");
    return handleError(res, null, "Required fields are missing", 400);
  }

  try {
    const db = getDB();
    const likerKey = cacheUserKey(likerId);
    const posterKey = cacheUserKey(posterEmail);
    const postKey = cachePostKey(postId);

    // Fetch liker
    let likedUser = await client.json.get(likerKey);
    if (!likedUser) {
      likedUser = await db
        .collection("users")
        .findOne({ _id: new ObjectId(likerId) });
      if (!likedUser) return handleError(res, null, "Liker not found", 404);
      await client.json.set(likerKey, "$", likedUser);
      await client.expire(likerKey, 600);
    }

    // Fetch poster with posts
    let posterUser = await client.json.get(posterKey);
    if (!posterUser) {
      posterUser = await db.collection("users").findOne({ email: posterEmail });
      if (!posterUser) return handleError(res, null, "Poster not found", 404);
      await client.json.set(posterKey, "$", posterUser);
      await client.expire(posterKey, 600);
    }

    if (posterEmail === likedUser.email) {
      io?.emit("likedError", "You cannot like your own post");
      return handleError(res, null, "You cannot like your own post", 409);
    }

    const now = new Date();
    const likeId = new ObjectId();

    const liked = {
      _id: likeId,
      postOwnerEmail: posterUser.email,
      likedByEmail: likedUser.email,
      likedByFirstName: likedUser.firstName,
      likedByLastName: likedUser.lastName,
      profileImage: likedUser.profileImage,
      createdAt: now,
    };

    // Update in DB
    await db
      .collection("users")
      .updateOne(
        { email: posterEmail, "posts._id": new ObjectId(postId) },
        { $addToSet: { "posts.$.liked": liked } }
      );

    await db
      .collection("posts")
      .updateOne(
        { _id: new ObjectId(postId) },
        { $addToSet: { liked: liked } }
      );

    // Update posterUser cache dependently
    posterUser.posts = posterUser.posts.map((post) => {
      if (post._id.toString() === postId) {
        post.liked = post.liked || [];
        // avoid duplicate like
        if (!post.liked.find((l) => l.likedByEmail === likedUser.email)) {
          post.liked.push(liked);
        }
      }
      return post;
    });
    await client.json.set(posterKey, "$", posterUser);
    await client.expire(posterKey, 600);

    const post = posterUser.posts.find((p) => p._id.toString() === postId);

    // Add notification
    const notification = {
      notif_id: new ObjectId(),
      post_id: postId,
      postOwnerEmail: posterUser.email,
      firstName: likedUser.firstName,
      lastName: likedUser.lastName,
      profileImage: likedUser.profileImage,
      title: post?.title || "",
      userDid: "liked this post",
      read: false,
      createdAt: now,
    };

    await db
      .collection("users")
      .updateOne(
        { email: posterEmail },
        { $addToSet: { notifications: notification } }
      );

    io?.emit("postLiked", {
      postId,
      likedBy: likedUser.email,
      postOwner: posterUser.email,
    });

    return res.status(200).json({ message: "Liked successfully", post });
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
    const likerKey = cacheUserKey(likerId);
    const posterKey = cacheUserKey(posterEmail);
    const postKey = cachePostKey(postId);

    // Fetch liker
    let likedUser = await client.json.get(likerKey);
    if (!likedUser) {
      likedUser = await db
        .collection("users")
        .findOne({ _id: new ObjectId(likerId) });
      if (!likedUser) return handleError(res, null, "Liker not found", 404);
      await client.json.set(likerKey, "$", likedUser);
      await client.expire(likerKey, 600);
    }

    // Fetch poster with posts
    let posterUser = await client.json.get(posterKey);
    if (!posterUser) {
      posterUser = await db.collection("users").findOne({ email: posterEmail });
      if (!posterUser) return handleError(res, null, "Poster not found", 404);
      await client.json.set(posterKey, "$", posterUser);
      await client.expire(posterKey, 600);
    }

    // Remove like in DB
    await db
      .collection("users")
      .updateOne(
        { email: posterEmail, "posts._id": new ObjectId(postId) },
        { $pull: { "posts.$.liked": { likedByEmail: likedUser.email } } }
      );

    await db
      .collection("posts")
      .updateOne(
        { _id: new ObjectId(postId) },
        { $pull: { liked: { likedByEmail: likedUser.email } } }
      );

    // Update posterUser cache dependently
    posterUser.posts = posterUser.posts.map((post) => {
      if (post._id.toString() === postId) {
        post.liked =
          post.liked?.filter((l) => l.likedByEmail !== likedUser.email) || [];
      }
      return post;
    });
    await client.json.set(posterKey, "$", posterUser);
    await client.expire(posterKey, 600);

    io?.emit("postUnliked", {
      postId,
      unlikedBy: likedUser.email,
      postOwner: posterUser.email,
    });

    return res.status(200).json({
      message: "Unliked successfully",
      post: posterUser.posts.find((p) => p._id.toString() === postId),
    });
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
    const postOwnerKey = cacheUserKey(PostEmail);
    const commenterKey = cacheUserKey(commentedUser);
    const postKey = cachePostKey(postId);

    // Fetch post owner from Redis or DB
    let postOwner = await client.json.get(postOwnerKey);
    if (!postOwner) {
      postOwner = await db.collection("users").findOne({ email: PostEmail });
      if (!postOwner)
        return handleError(res, null, "Post owner not found", 404);
      await client.json.set(postOwnerKey, "$", postOwner);
      await client.expire(postOwnerKey, 600);
    }

    // Fetch commenter from Redis or DB
    let commenter = await client.json.get(commenterKey);
    if (!commenter) {
      commenter = await db
        .collection("users")
        .findOne({ email: commentedUser });
      if (!commenter)
        return handleError(res, null, "Commenting user not found", 404);
      await client.json.set(commenterKey, "$", commenter);
      await client.expire(commenterKey, 600);
    }

    // Find post in user's embedded posts
    let post = postOwner.posts?.find((p) => p._id?.toString() === postId);
    if (!post) {
      post = await db
        .collection("posts")
        .findOne({ _id: new ObjectId(postId) });
      if (!post) return handleError(res, null, "Post not found", 404);
    }

    const now = new Date();

    const lastComment = post.comments?.slice(-1)[0];
    if (
      lastComment &&
      lastComment.createdAt &&
      commenter.email === lastComment.email
    ) {
      const secondsSinceLast = (now - new Date(lastComment.createdAt)) / 1000;
      if (secondsSinceLast < COMMENT_COOLDOWN_SECONDS) {
        return handleError(
          res,
          null,
          `You're commenting too fast. Please wait a few seconds.`,
          429
        );
      }
    }

    const newComment = {
      _id: new ObjectId(),
      firstName: commenter.firstName,
      lastName: commenter.lastName,
      email: commenter.email,
      profileImage: commenter.profileImage,
      commentText: trimmedComment,
      createdAt: now,
    };

    // --- Update in MongoDB ---
    await Promise.all([
      db
        .collection("users")
        .updateOne(
          { email: PostEmail, "posts._id": new ObjectId(postId) },
          { $addToSet: { "posts.$.comments": newComment } }
        ),
      db
        .collection("posts")
        .updateOne(
          { _id: new ObjectId(postId) },
          { $addToSet: { comments: newComment } }
        ),
      db.collection("users").updateOne(
        { email: PostEmail },
        {
          $addToSet: {
            notifications: {
              notif_id: new ObjectId(),
              post_id: postId,
              postOwnerEmail: postOwner.email,
              firstName: commenter.firstName,
              lastName: commenter.lastName,
              profileImage: commenter.profileImage,
              title: post.title,
              userDid: "commented on your post",
              createdAt: now,
              read: false,
            },
          },
        }
      ),
    ]);

    // --- Update Redis dependently ---
    // Update post in postOwner cache
    if (postOwner.posts) {
      postOwner.posts = postOwner.posts.map((p) => {
        if (p._id?.toString() === postId) {
          p.comments = p.comments || [];
          p.comments.push(newComment);
        }
        return p;
      });
      await client.json.set(postOwnerKey, "$", postOwner);
      await client.expire(postOwnerKey, 600);
    }

    // Update separate post cache if exists
    let cachedPost = await client.json.get(postKey);
    if (cachedPost) {
      cachedPost.comments = cachedPost.comments || [];
      cachedPost.comments.push(newComment);
      await client.json.set(postKey, "$", cachedPost);
      await client.expire(postKey, 600);
    }

    return res.status(200).json({
      message: "Comment added successfully",
      commentId: newComment._id,
      comment: newComment,
    });
  } catch (error) {
    console.error("❌ Commenting failed:", error);
    return handleError(res, error, "Failed to add comment", 500);
  }
};

const activePosts = async (req, res) => {
  try {
    const db = getDB();

    // Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Redis cache key for paginated posts
    const redisKey = `posts:page:${page}:limit:${limit}`;

    // ✅ Step 1: Check Redis cache
    const cachedPosts = await client.json.get(redisKey);
    if (cachedPosts) {
      return res.status(200).json({
        source: "cache",
        ...cachedPosts,
      });
    }

    // ✅ Step 2: Fetch total post count from DB
    const postCount = await db.collection("posts").countDocuments();

    // ✅ Step 3: Fetch posts with pagination
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
      .skip(skip)
      .limit(limit)
      .toArray();

    const result = {
      totalCount: postCount,
      totalPages: Math.ceil(postCount / limit),
      currentPage: page,
      data: posts,
    };

    // ✅ Step 4: Cache the result in Redis (expires in 5 minutes)
    await client.json.set(redisKey, "$", result);
    await client.expire(redisKey, 300);

    // ✅ Step 5: Return the response
    res.status(200).json({
      source: "db",
      ...result,
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
