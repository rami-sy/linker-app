const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema({
  // المستخدم الذي قام بالتفاعل
  liker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // نوع التفاعل (Like, Love, Haha, Angry, الخ)
  reaction: {
    type: String,
    enum: [
      "like",
      "love",
      "haha",
      "wow",
      "sad",
      "angry",
      "celebrate",
      "support",
      "agree",
      "disagree",
      "confused",
      "dislike",
    ],
    default: "like",
  },
  // هنا تحدد نوع المودل الذي ستشير إليه في الحقل التالي (Dynamic Reference)
  targetModel: {
    type: String,
    required: true,
    enum: ["User", "Post", "Comment"], // ضع أسماء المودلز التي تريد دعم التفاعل عليها
  },

  // الحقل الذي يشير ديناميكياً إلى إحدى المودلز المحددة في targetModel
  target: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "targetModel",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Like = mongoose.model("Like", likeSchema);
module.exports = Like;
