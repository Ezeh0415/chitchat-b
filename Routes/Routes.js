const express = require("express");
const router = express.Router();
const multer = require("multer");
const AuthContr = require("../Controller/Auth-Contr");
const ProfileContr = require("../Controller/Profile-contr");
const postContr = require("../Controller/Posts-contr");
const FriendContr = require("../Controller/Friends-contr");
const ChatContr = require("../Controller/Chat-Contr");

const upload = multer({ dest: "uploads/" });

router.post("/api/signup", AuthContr.signup);
router.post("/api/login", AuthContr.login);
router.get("/api/logout", AuthContr.logout);
router.post("/api/verifyOtp", AuthContr.VerifyOtp);
router.post("/api/resetOtp", AuthContr.ResetOtp);
router.post(
  "/api/chit-chat-profile-img",
  upload.single("image"),
  ProfileContr.ProfileImage
);
router.post(
  "/api/chit-chat-cover-img",
  upload.single("image"),
  ProfileContr.CoverImage
);

// post section
router.post(
  "/api/createImagePost",
  upload.single("image"),
  postContr.PostWithImage
);
// router.post("/api/createTextPost", postContr.PostOnlyText);
router.post("/api/likedPost", postContr.LikedPosts);
router.post("/api/UnlikePost", postContr.UnlikePost);
router.post("/api/postDisplay", postContr.postDisplay);
router.post("/api/commentedPost", postContr.CommentOnPost);
router.post("/api/addFriends", FriendContr.AddFriends);
router.post("/api/acceptFriendRequest/:id", FriendContr.AcceptFriendRequests);
router.post("/api/clearNotifications", postContr.notifclear);
router.post("/api/unfriend/:id", FriendContr.Unfriend);
router.post("/api/chatUser/:id", ChatContr.getChatUser);
router.post("/api/chat/:id", ChatContr.chat);
router.post("/api/getChatMessages", ChatContr.getChatMessages);
router.post(
  "/api/profileSetup",
  upload.single("image"),
  ProfileContr.profileSetup
);
// get section
router.get("/api/getUserProfile/:email", AuthContr.getProfile);
router.get("/api/usersGetProfile/:email", AuthContr.usersGetProfile);
router.get("/api/users", FriendContr.getRegisterdUser);
router.get("/api/posts", postContr.activePosts);
router.get("/api/friendRequests/:id", FriendContr.FriendRequests);

// delete section
router.delete("/api/deleteFriendRequest/:id", FriendContr.DeleteFriendRequests);

module.exports = router;
