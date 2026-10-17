import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";

import User from "../models/user.js";

const signin: RequestHandler = async (req, res) => {
  const { email, password } = req.body;
  try {
    const oldUser = await User.findOne({ email: email });
    if (!oldUser) {
      return res.status(400).json({ msg: "User does not exist" });
    }

    const isPasswordValid = await bcrypt.compare(password, oldUser.password);

    if (!isPasswordValid) {
      return res.status(400).json({ msg: "Invalid Password" });
    }

    const token = jwt.sign(
      { email: oldUser.email, uid: oldUser._id },
      process.env.JWT_SECRET ?? "",
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({ result: oldUser, token });
  } catch (error) {
    res.status(500).json({ msg: "Something went wrong" });
  }
};

const signup: RequestHandler = async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  try {
    const oldUser = await User.findOne({ email: email });
    if (oldUser) {
      return res
        .status(400)
        .json({ msg: "Email has associated with an account" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ msg: "Password do not match" });
    }

    const encryptedPassword = await bcrypt.hash(password, 12);

    const result = await User.create({
      username: username,
      email: email,
      password: encryptedPassword,
    });

    const token = jwt.sign(
      { email: result.email, uid: result._id },
      process.env.JWT_SECRET ?? "",
      {
        expiresIn: "1h",
      }
    );
    res.status(201).json({ result: result, token });
  } catch (error) {
    res.status(500).json({ msg: "Something went wrong" });
  }
};

export { signin, signup };
