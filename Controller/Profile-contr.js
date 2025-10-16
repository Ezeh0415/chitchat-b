const { getDB } = require("../Models/Db");
const { ObjectId } = require("mongodb");
const { handleError } = require("../Utils/ErrorHandler");
const cloudinary = require("../Utils/Cloudinary");
const { getIO } = require("../Models/Socket"); // Import io from server.js

const ProfileImage = async (req, res) => {
  if (!req.body) {
    return handleError(res, null, "No form data received", 500);
  }
  const { email, media } = req.body;
  // multer uploads the file; image will be in req.file, not req.body.image
  if (!email || !media) {
    return handleError(
      res,
      null,
      "Email and image are required for upload",
      400
    );
  }

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

    // Update user's profile image URL in DB
    await db
      .collection("users")
      .updateOne(
        { email },
        { $set: { profileImage: uploadResult.secure_url } }
      );

    // Update all embedded posts
    await db
      .collection("users")
      .updateOne(
        { email },
        { $set: { "posts.$[].profileImage": uploadResult.secure_url } }
      );

    // 2. Update profile image in all posts by this user
    await db
      .collection("posts")
      .updateMany(
        { email },
        { $set: { profileImage: uploadResult.secure_url } }
      );

    const io = getIO();

    console.log("io is working:", io);

    if (io) {
      io.emit("newProfileImage", uploadResult.secure_url);
      console.log("Emitted newProfileImage event via Socket.IO");
    }

    // io.on("connection", (socket) => {
    //   console.log("User connected:", socket.id);

    //   // Example event
    //   socket.emit('chat message', 'Hello from node/express!');

    //   // socket.on("disconnect", () => {
    //   //   console.log("User disconnected:", socket.id);
    //   // });
    // });

    // Respond with success and image URL
    return res.status(200).json({
      message: "Profile image uploaded successfully",
      mediaType: mediaType,
      imageUrl: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    return handleError(res, error, "Failed to upload profile image", 500);
  }
};

const CoverImage = async (req, res) => {
  const { email } = req.body;

  // multer uploads the file; image will be in req.file, not req.body.image
  if (!email || !req.file) {
    return handleError(
      res,
      null,
      "Email and image are required for upload",
      400
    );
  }

  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return handleError(res, null, "User not found", 404);
    }

    const fileTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!fileTypes.includes(req.file.mimetype)) {
      return handleError(res, null, "Only image files are allowed", 400);
    }

    // Upload image file from multer (req.file.path) to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "profile_images",
      public_id: user._id.toString(),
      overwrite: true,
    });

    // Update user's profile image URL in DB
    await db
      .collection("users")
      .updateOne({ email }, { $set: { coverImage: uploadResult.secure_url } });

    // await db
    //   .collection("users")
    //   .updateOne(
    //     { email },
    //     { $set: { "posts.$[].coverImage": uploadResult.secure_url } }
    //   );

    // await db.collection("users").updateOne(
    //   { email },
    //   { $set: { "posts.$[].coverImage": uploadResult.secure_url } }
    // );

    const fs = require("fs");
    fs.unlinkSync(req.file.path);

    // Respond with success and image URL
    return res.status(200).json({
      message: "Profile image uploaded successfully",
      imageUrl: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    return handleError(res, error, "Failed to upload profile image", 500);
  }
};

module.exports = {
  ProfileImage,
  CoverImage,
};
