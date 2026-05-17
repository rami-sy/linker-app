const Posts = require("../../models/post.model");

const getPosts = async ({ args, socket, redisClient }) => {
  try {
    const { page = 1, size = 25, search = "" } = args;
    const pageSize = parseInt(size);
    const skip = (page - 1) * pageSize;

    // بناء فلتر البحث
    const searchFilter = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { content: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // جلب المشاركات مع التصفية بناءً على البحث والترتيب حسب التاريخ
    const posts = await Posts.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate({
        path: "user",
        populate: { path: "images colors" },
      })
      .exec();

    // إعادة البيانات عبر الـ socket
    socket.emit("getPosts", { posts });
  } catch (error) {
    console.log({ error });
  }
};

const postServices = {
  getPosts,
};

module.exports = postServices;
