jest.mock("../../Models/Db");
jest.mock("../../Utils/ErrorHandler");

const { ObjectId } = require("mongodb");
const { getDB } = require("../../Models/Db");
const { handleError } = require("../../Utils/ErrorHandler");

const {
  getRegisterdUser,
  AddFriends,
  FriendRequests,
  AcceptFriendRequests,
  DeleteFriendRequests,
} = require("../../Controller/Friends-Contr");

let req, res, dbMock;

beforeEach(() => {
  jest.clearAllMocks();

  req = { body: {}, params: {} };
  res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  dbMock = {
    collection: jest.fn().mockReturnThis(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn(),
  };

  getDB.mockReturnValue(dbMock);
});

// --- getRegisterdUser ---

describe("getRegisterdUser", () => {
  test("success returns users", async () => {
    dbMock.countDocuments.mockResolvedValue(2);
    dbMock.find.mockReturnValue(dbMock);
    dbMock.sort.mockReturnValue(dbMock);
    dbMock.toArray.mockResolvedValue([
      { email: "user1@test.com" },
      { email: "user2@test.com" },
    ]);

    await getRegisterdUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      totalCount: 2,
      data: [{ email: "user1@test.com" }, { email: "user2@test.com" }],
    });
  });

  test("error handling", async () => {
    const error = new Error("fail");
    dbMock.countDocuments.mockRejectedValue(error);

    await getRegisterdUser(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      error,
      "Failed to fetch users"
    );
  });
});

// --- AddFriends ---

describe("AddFriends", () => {
  test("returns 400 if emails missing", async () => {
    req.body = {};

    await AddFriends(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "email must not be empty",
      400
    );
  });

  test("returns 404 if adder user not found", async () => {
    req.body = {
      AdderEmail: "adder@test.com",
      ReciverEmail: "receiver@test.com",
    };
    dbMock.findOne.mockResolvedValueOnce(null); // adder user missing

    await AddFriends(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Adder user not found",
      404
    );
  });

  test("success sends friend request", async () => {
    req.body = {
      AdderEmail: "adder@test.com",
      ReciverEmail: "receiver@test.com",
    };

    const adderUser = {
      email: "adder@test.com",
      firstName: "Adder",
      lastName: "User",
      profileImage: "img.png",
    };

    dbMock.findOne.mockResolvedValueOnce(adderUser); // find adder user

    dbMock.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await AddFriends(req, res);

    expect(dbMock.updateOne).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "friend request sent successfully",
    });
  });

  test("error handling", async () => {
    req.body = {
      AdderEmail: "adder@test.com",
      ReciverEmail: "receiver@test.com",
    };
    const error = new Error("fail");
    dbMock.findOne.mockRejectedValue(error);

    await AddFriends(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      error,
      "friend request was unsuccessfull"
    );
  });
});

// --- FriendRequests ---

describe("FriendRequests", () => {
  test("returns 400 for invalid id", async () => {
    req.params.id = "invalid";

    await FriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(res, null, "invalid user id", 400);
  });

  test("returns 404 if user not found", async () => {
    req.params.id = new ObjectId().toHexString();
    dbMock.collection.mockReturnThis();
    dbMock.findOne.mockResolvedValue(null);

    await FriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(res, null, "User not found", 404);
  });

  test("returns friend requests", async () => {
    req.params.id = new ObjectId().toHexString();

    dbMock.collection.mockReturnThis();
    dbMock.findOne.mockResolvedValue({
      FriendRequest: [{ email: "friend@test.com" }],
    });

    await FriendRequests(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ email: "friend@test.com" }],
    });
  });

  test("error handling", async () => {
    req.params.id = new ObjectId().toHexString();
    const error = new Error("fail");

    dbMock.collection.mockReturnThis();
    dbMock.findOne.mockRejectedValue(error);

    await FriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      error,
      "unable to get friend requests from database"
    );
  });
});

// --- AcceptFriendRequests ---

describe("AcceptFriendRequests", () => {
  test("returns 400 if email or id invalid", async () => {
    req.body.usersEmail = "";
    req.params.id = "invalid";

    await AcceptFriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "email or id must be valid ",
      400
    );
  });

  test("returns 500 if friend request not found", async () => {
    req.body.usersEmail = "user@test.com";
    req.params.id = new ObjectId().toHexString();

    dbMock.collection.mockReturnThis();
    dbMock.findOne.mockResolvedValueOnce(null); // friend request not found

    await AcceptFriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "could not fetch the friend request from the database",
      500
    );
  });

  test("success accepts friend request", async () => {
    req.body.usersEmail = "user@test.com";
    req.params.id = new ObjectId().toHexString();

    const friendsRequest = {
      firstName: "FriendFirst",
      lastName: "FriendLast",
      profileImage: "friend.png",
    };

    dbMock.collection.mockReturnThis();
    dbMock.findOne
      .mockResolvedValueOnce(friendsRequest) // friend request user found by ID
      .mockResolvedValueOnce({ email: "user@test.com" }); // userEmail found

    dbMock.updateOne.mockResolvedValue({ modifiedCount: 1 });
    dbMock.findOneAndUpdate.mockResolvedValue({ value: {} });

    await AcceptFriendRequests(req, res);

    expect(dbMock.updateOne).toHaveBeenCalledWith(
      { email: "user@test.com" },
      {
        $addToSet: {
          Friends: {
            firstName: friendsRequest.firstName,
            lastName: friendsRequest.lastName,
            profileImage: friendsRequest.profileImage,
            createdAt: expect.any(Date),
          },
        },
      }
    );

    expect(dbMock.findOneAndUpdate).toHaveBeenCalledWith(
      { email: "user@test.com" },
      { $pull: { FriendRequest: { id: req.params.id } } },
      { returnDocument: "after" }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "friend request accepted ",
    });
  });

  test("error handling", async () => {
    req.body.usersEmail = "user@test.com";
    req.params.id = new ObjectId().toHexString();

    const error = new Error("fail");

    dbMock.collection.mockReturnThis();
    dbMock.findOne.mockRejectedValue(error);

    await AcceptFriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      error,
      "failed to accept friend request",
      404
    );
  });
});

// --- DeleteFriendRequests ---

describe("DeleteFriendRequests", () => {
  test("returns 400 if email or id invalid", async () => {
    req.body.email = "";
    req.params.id = "invalid";

    await DeleteFriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "your email or id can not be empty",
      400
    );
  });

  test("success deletes friend request", async () => {
    req.body.email = "user@test.com";
    req.params.id = new ObjectId().toHexString();

    dbMock.collection.mockReturnThis();
    dbMock.findOneAndUpdate.mockResolvedValue({ value: {} });

    await DeleteFriendRequests(req, res);

    expect(dbMock.findOneAndUpdate).toHaveBeenCalledWith(
      { email: "user@test.com" },
      { $pull: { FriendRequest: { id: req.params.id } } },
      { returnDocument: "after" }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "friend request deleted successfully",
    });
  });

  test("error handling", async () => {
    req.body.email = "user@test.com";
    req.params.id = new ObjectId().toHexString();

    const error = new Error("fail");

    dbMock.collection.mockReturnThis();
    dbMock.findOneAndUpdate.mockRejectedValue(error);

    await DeleteFriendRequests(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      error,
      "failed to delete friend request",
      500
    );
  });
});
