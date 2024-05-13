import mongoose from "mongoose";

const userSchema = mongoose.Schema({
    username:{type: String, trim: true, require:true},
    email: {type: String, lowercase: true,match: [/.+\@.+\..+/, 'Please enter a valid email address'],require: true},
    password: {type: String, require: true},
    id:{type: String}
})

export default mongoose.model("User", userSchema)