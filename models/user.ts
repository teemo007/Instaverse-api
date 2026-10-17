import mongoose from "mongoose";

export interface IUser {
    username: string;
    email: string;
    password: string;
    id?: string;
}

const userSchema = new mongoose.Schema<IUser>({
    username:{type: String, trim: true, require:true},
    email: {type: String, lowercase: true,match: [/.+\@.+\..+/, 'Please enter a valid email address'],require: true},
    password: {type: String, require: true},
    id:{type: String}
})

export default mongoose.model<IUser>("User", userSchema)
