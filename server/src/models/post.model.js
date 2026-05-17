const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please enter a post title"],
    },
    content: {
      type: String,
      required: [true, "Please enter a post content"],
    },
    images: [
      {
        type: String,
      },
    ],

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
        // autopopulate: true,
      },
    ],
    tags: [
      {
        type: String,
      },
    ],
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        type: {
          type: String,
          enum: [
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
          ],
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);
postSchema.plugin(require("mongoose-autopopulate"));

// Feed-optimized indexes
postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ tags: 1, createdAt: -1 });

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
