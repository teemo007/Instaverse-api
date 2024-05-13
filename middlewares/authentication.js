import jwt from "jsonwebtoken";

const authentication = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (token) {
      let decodeData = jwt.verify(token, process.env.JWT_SECRET);

      req.userId = decodeData?.uid;
    }
    next();
  } catch (error) {
    console.log("Error:",error.message)
    return res.status(403).json({ message: 'Invalid token' });
  }
};

export default authentication;
