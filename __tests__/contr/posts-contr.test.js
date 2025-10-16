const {
  PostWithImage,
  PostOnlyText,
  LikedPosts,
  CommentOnPost,
} = require("../../Controller/Posts-Contr");

jest.mock("../../Models/Db", () => ({
  getDB: jest.fn(),
}));

jest.mock("../../Utils/ErrorHandler", () => ({
  handleError: jest.fn((res, error, message, status) =>
    res.status(status || 500).json({ message })
  ),
}));

jest.mock("../../Utils/Cloudinary", () => ({
  uploader: {
    upload: jest.fn(() => Promise.resolve({ secure_url: "mock_url" })),
  },
}));

jest.mock("fs", () => ({
  unlinkSync: jest.fn(),
}));

const { getDB } = require("../../Models/Db");
const { handleError } = require("../../Utils/ErrorHandler");

function mockRequest(data = {}) {
  return {
    body: data.body || {},
    file: data.file || null,
    params: data.params || {},
    query: data.query || {},
  };
}

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("Posts Controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();

    dbMock = {
      collection: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      insertOne: jest.fn(),
    };
    getDB.mockReturnValue(dbMock);
    jest.clearAllMocks();
  });

  // PostWithImage tests
  describe("PostWithImage", () => {
    it("should handle missing required fields", async () => {
      req.body = {};
      req.file = null;
      await PostWithImage(req, res);
      expect(handleError).toHaveBeenCalledWith(
        res,
        null,
        expect.stringContaining("required"),
        400
      );
    });

    it("should handle user not found", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      req.file = { mimetype: "image/png", path: "somepath" };
      dbMock.findOne.mockResolvedValue(null);
      await PostWithImage(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "User not found", 404);
    });

    it("should handle invalid file type", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      req.file = { mimetype: "application/pdf", path: "somepath" };
      dbMock.findOne.mockResolvedValue({ _id: "id" });
      await PostWithImage(req, res);
      expect(handleError).toHaveBeenCalledWith(
        res,
        null,
        expect.stringContaining("Only image and video files are allowed"),
        400
      );
    });

    it("should upload media and update DB successfully", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      req.file = { mimetype: "image/png", path: "mockpath" };
      const user = {
        _id: "id",
        firstName: "First",
        lastName: "Last",
        profileImage: "img",
      };
      dbMock.findOne.mockResolvedValue(user);
      dbMock.updateOne.mockResolvedValue({});
      dbMock.insertOne.mockResolvedValue({});
      const fs = require("fs");

      await PostWithImage(req, res);

      expect(dbMock.collection).toHaveBeenCalledWith("users");
      expect(dbMock.findOne).toHaveBeenCalledWith({ email: "a@test.com" });
      expect(dbMock.updateOne).toHaveBeenCalled();
      expect(dbMock.insertOne).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith("mockpath");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Media uploaded successfully",
        mediaType: "image",
        mediaUrl: "mock_url",
      });
    });

    it("should handle errors during upload", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      req.file = { mimetype: "image/png", path: "mockpath" };
      const user = {
        _id: "id",
        firstName: "First",
        lastName: "Last",
        profileImage: "img",
      };
      dbMock.findOne.mockResolvedValue(user);

      const cloudinary = require("../../Utils/Cloudinary");
      cloudinary.uploader.upload.mockRejectedValue(new Error("Upload failed"));

      await PostWithImage(req, res);

      expect(handleError).toHaveBeenCalledWith(
        res,
        expect.any(Error),
        "Failed to upload media",
        500
      );
    });
  });

  // PostOnlyText tests
  describe("PostOnlyText", () => {
    it("should handle missing required fields", async () => {
      req.body = {};
      await PostOnlyText(req, res);
      expect(handleError).toHaveBeenCalledWith(
        res,
        null,
        expect.stringContaining("required"),
        400
      );
    });

    it("should handle user not found", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      dbMock.findOne.mockResolvedValue(null);
      await PostOnlyText(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "User not found", 404);
    });

    it("should create post successfully", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      const user = {
        firstName: "First",
        lastName: "Last",
        profileImage: "img",
      };
      dbMock.findOne.mockResolvedValue(user);
      dbMock.updateOne.mockResolvedValue({});
      dbMock.insertOne.mockResolvedValue({});

      await PostOnlyText(req, res);

      expect(dbMock.updateOne).toHaveBeenCalled();
      expect(dbMock.insertOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Post created successfully" });
    });

    it("should handle errors during post creation", async () => {
      req.body = { email: "a@test.com", title: "Title", postText: "Text" };
      const user = {
        firstName: "First",
        lastName: "Last",
        profileImage: "img",
      };
      dbMock.findOne.mockResolvedValue(user);
      dbMock.updateOne.mockRejectedValue(new Error("DB error"));

      await PostOnlyText(req, res);

      expect(handleError).toHaveBeenCalledWith(
        res,
        expect.any(Error),
        "Failed to create post",
        500
      );
    });
  });

  // LikedPosts tests
  describe("LikedPosts", () => {
    it("should handle missing emails", async () => {
      req.body = {};
      await LikedPosts(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "Email is required", 400);
    });

    it("should prevent liking own post", async () => {
      req.body = { posterEmail: "a@test.com", likedEmail: "a@test.com" };
      await LikedPosts(req, res);
      expect(handleError).toHaveBeenCalledWith(
        res,
        null,
        "You cannot like your own post",
        400
      );
    });

    it("should handle users not found", async () => {
      req.body = { posterEmail: "a@test.com", likedEmail: "b@test.com" };
      dbMock.findOne.mockResolvedValue(null);
      await LikedPosts(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "Users not found", 404);
    });

    it("should like post successfully", async () => {
      req.body = { posterEmail: "a@test.com", likedEmail: "b@test.com" };
      const posterUser = {
        email: "a@test.com",
        firstName: "First",
        lastName: "Poster",
        profileImage: "img",
        title: "Title",
        postText: "Post text",
      };
      const likedUser = {
        email: "b@test.com",
        firstName: "Liked",
        lastName: "User",
        profileImage: "img",
      };

      dbMock.findOne
        .mockResolvedValueOnce(posterUser)
        .mockResolvedValueOnce(likedUser);
      dbMock.updateOne.mockResolvedValue({});

      await LikedPosts(req, res);

      expect(dbMock.updateOne).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Liked successfully" });
    });

    it("should handle errors during liking post", async () => {
      req.body = { posterEmail: "a@test.com", likedEmail: "b@test.com" };
      const posterUser = {
        email: "a@test.com",
        firstName: "First",
        lastName: "Poster",
        profileImage: "img",
        title: "Title",
        postText: "Post text",
      };
      const likedUser = {
        email: "b@test.com",
        firstName: "Liked",
        lastName: "User",
        profileImage: "img",
      };
      dbMock.findOne
        .mockResolvedValueOnce(posterUser)
        .mockResolvedValueOnce(likedUser);
      dbMock.updateOne.mockRejectedValue(new Error("DB error"));

      await LikedPosts(req, res);

      expect(handleError).toHaveBeenCalledWith(
        res,
        expect.any(Error),
        "Failed to like, try again",
        500
      );
    });
  });

  // CommentOnPost tests
  describe("CommentOnPost", () => {
    const commentedUser = {
      email: "commenter@test.com",
      firstName: "Comment",
      lastName: "User",
      profileImage: "img",
    };

    it("should handle missing required fields", async () => {
      req.body = {};
      await CommentOnPost(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "Missing required data", 400);
    });

    it("should handle comment length validation", async () => {
  req.body = {
    PostEmail: "user@test.com",
    postId: "507f1f77bcf86cd799439011",
    commentedUser: {
      email: "a@test.com",
      firstName: "A",
      lastName: "B",
      profileImage: "img",
    },
    commentText: "", // too short
  };

  await CommentOnPost(req, res);

  expect(handleError).toHaveBeenCalledWith(
    res,
    null,
    expect.stringContaining("between 1 and"),
    400
  );
});

      await CommentOnPost(req, res);
      expect(handleError).toHaveBeenCalledWith(
        res,
        null,
        expect.stringContaining("between 1 and"),
        400
      );
    });

    it("should handle post not found", async () => {
        req.body = {
    PostEmail: "user@test.com",
    postId: "507f1f77bcf86cd799439011", // valid ObjectId
    commentedUser: {
      email: "a@test.com",
      firstName: "A",
      lastName: "B",
      profileImage: "img",
    },
    commentText: "Nice post!",
  };
      dbMock.findOne.mockResolvedValue(null);
      await CommentOnPost(req, res);
      expect(handleError).toHaveBeenCalledWith(res, null, "Post not found", 404);
    });

   const { ObjectId } = require("mongodb");

it("should add comment successfully", async () => {
  const validPostId = "507f1f77bcf86cd799439011";
  const commentText = "Awesome post!";

  req.body = {
    PostEmail: "user@test.com",
    postId: validPostId,
    commentedUser: {
      email: "a@test.com",
      firstName: "A",
      lastName: "B",
      profileImage: "img",
    },
    commentText,
  };

  const now = new Date();
  const fakePost = {
    _id: new ObjectId(validPostId),
    comments: [],
  };

  dbMock.findOne.mockResolvedValueOnce({
    email: "user@test.com",
    posts: [fakePost],
  });

  dbMock.updateOne.mockResolvedValue({}); // All updateOne calls

  await CommentOnPost(req, res);

  expect(dbMock.updateOne).toHaveBeenCalled(); // at least once
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Comment added successfully",
    })
  );
});


    it("should handle errors during commenting", async () => {
      req.body = {
        PostEmail: "a@test.com",
        postId: "123",
        commentedUser,
        commentText: "Valid comment",
      };
      const post = { comments: [] };
      dbMock.findOne.mockResolvedValue(post);
      dbMock.updateOne.mockRejectedValue(new Error("DB error"));

      await CommentOnPost(req, res);

      expect(handleError).toHaveBeenCalledWith(
        res,
        expect.any(Error),
        "Failed to add comment",
        500
      );
    });
  });
});
