import mongoose, { Document } from "mongoose";
import { IUser } from "./user";

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  from: mongoose.Types.ObjectId | IUser; // User
  to: mongoose.Types.ObjectId; // Chat Room
  receivers: mongoose.Types.ObjectId[]; // Users that received the message
  message: string;
  updatedAt?: Date;
  createdAt?: Date;
}

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, index: 1, required: true },
    to: { type: mongoose.Schema.Types.ObjectId, index: 1, required: true },
    receivers: {
      type: [mongoose.Schema.Types.ObjectId],
      index: 1,
      default: [],
    },
    message: { type: String, index: 1, required: true },
  },
  { timestamps: true }
);

const MessageModel = mongoose.model<IMessage>("messages", messageSchema);

export default MessageModel;
