const Base_Url = "http://localhost:8080/";

const handlePost = () => {
  const firstName = "Ezeanwe";
  const lastName = "Chigozie";
  const password = "chigozie3942";
  const email = "ezeanwechigozie@gmail.com";
  const otp = "507118";
  const userImage = "https://picsum.photos/200/300";
  fetch(`${Base_Url}chit-chat/profile-img`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // firstName,
      // lastName,
      // password,
      email,
      // otp,
      userImage
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};

// const formData = new FormData();
// formData.append("email", email);            // your email field
// formData.append("image", userImage);        // 'image' must match multer field name

// fetch(`${Base_Url}chit-chat/profile-img`, {
//   method: "POST",
//   body: formData, // Don't set Content-Type manually!
// })
//   .then((response) => response.json())
//   .then((data) => {
//     console.log("Upload success:", data);
//   })
//   .catch((error) => {
//     console.error("Upload error:", error);
//   });


// handlePost();