const jwt = require("jsonwebtoken");
const config = require("../config/auth.config.js");

const verifyToken = (req, res, next) => {
  let token = req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send({ message: "No token provided!" });
  }

  jwt.verify(token, config.secret, (err, decoded) => {
    // console.log({ decoded, token, config: config.secret, err });
    if (err) {
      return res.status(401).send({ type: "error", message: "Unauthorized!" });
    }

    // حساب عدد الأيام المتبقية لانتهاء صلاحية التوكن
    const expiryDate = new Date(decoded.exp * 1000); // تحويل `exp` إلى تاريخ
    const currentDate = new Date();
    const timeDifference = expiryDate - currentDate;
    const daysRemaining = Math.ceil(timeDifference / (1000 * 60 * 60 * 24)); // تحويل الفرق إلى أيام

    req.user = {
      ...decoded,
      daysRemaining, // إضافة عدد الأيام المتبقية إلى معلومات المستخدم
    };

    next();
  });
};

module.exports = verifyToken;
