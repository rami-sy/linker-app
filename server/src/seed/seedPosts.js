const User = require("../models/user.model");
const Post = require("../models/post.model");
const Comment = require("../models/comment.model");
const { faker } = require("@faker-js/faker");
const seedPosts = async (numPosts) => {
  try {
    const reactions = [
      "like",
      "love",
      "haha",
      "wow",
      "sad",
      "angry",
      "thankful",
      "pride",
      "support",
      "curious",
      "inspired",
      "amused",
      "dislike",
      "shocked",
    ];
    // Fetch all users
    // const users = await User.find() ; find first 1000 users
    const users = await User.find().limit(1000);
    if (users.length === 0) {
      throw new Error("No users found. Please seed users first.");
    }

    // Generate posts
    for (let i = 0; i < numPosts; i++) {
      const userIndex = faker.number.int({
        min: 0,
        max: users.length - 1,
      });
      const user = users[userIndex];

      const newPost = new Post({
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraphs(2),
        images: [faker.image.avatar()],
        user: user._id,

        // intially, posts may not have comments or reactions
      });

      // Randomize reactions for each post
      const shuffledReactions = faker.helpers.shuffle(reactions);
      const numReactions = faker.datatype.number({ min: 1, max: 14 }); // Up to 14 reactions
      const postReactions = shuffledReactions.slice(0, numReactions);

      postReactions.forEach((reactionType) => {
        const reactionUserIndex = faker.datatype.number({
          min: 0,
          max: users.length - 1,
        });
        const reactionUser = users[reactionUserIndex];

        newPost.reactions.push({
          user: reactionUser._id,
          type: reactionType,
        });
      });

      await newPost.save();

      // Optionally, generate comments and reactions for the post
      const numComments = faker.number.int({ min: 1, max: 5 });
      for (let j = 0; j < numComments; j++) {
        const commentUserIndex = faker.number.int({
          min: 0,
          max: users.length - 1,
        });
        const commentUser = users[commentUserIndex];

        const newComment = new Comment({
          content: faker.lorem.sentence(),
          post: newPost._id,
          user: commentUser._id,
          // intially, comments may not have reactions or replies
        });

        await newComment.save();

        // Linking comment to post
        newPost.comments.push(newComment._id);
      }

      // Add some reactions to the post

      console.log("post created", i);
    }

    console.log(`Successfully seeded ${numPosts} posts.`);
  } catch (error) {
    console.error("Error seeding posts:", error);
  }
};
module.exports = seedPosts;
