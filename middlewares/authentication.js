import jwt from "jsonwebtoken";

const authentication = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(" ")[1];

    if (token) {
      let decodeData = jwt.verify(token, process.env.JWT_SECRET);

      req.userId = decodeData?.id;
    }
    next();
  } catch (error) {
    console.log(error);
  }
};

export default authentication;
