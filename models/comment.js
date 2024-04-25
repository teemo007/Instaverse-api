import mongoose from "mongoose";

const commentSchema = mongoose.Schema({
    story_id: {type:String},
    user_id: {type:String},
    comment_context:{type:String}
})

export default mongoose.model("Comment",commentSchema)