import mongoose, { Document } from "mongoose";

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  from: mongoose.Types.ObjectId; // User
  to: mongoose.Types.ObjectId; // Chat Room
  message: string;
  updatedAt?: Date;
  createdAt?: Date;
}

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, index: 1, required: true },
    to: { type: mongoose.Schema.Types.ObjectId, index: 1, required: true },
    message: { type: String, index: 1, required: true },
  },
  { timestamps: true }
);

const MessageModel = mongoose.model<IMessage>("messages", messageSchema);

export default MessageModel;
