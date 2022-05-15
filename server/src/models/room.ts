import mongoose, { Document } from "mongoose";
import { IMessage } from "./message";
import { IUser } from "./user";

export interface IRoom extends Document {
  _id: mongoose.Types.ObjectId;
  roomName: string;
  messageIds: mongoose.Types.ObjectId[];
  messages: IMessage[];
  participantIds: mongoose.Types.ObjectId[];
  participants: IUser[];
  isPublic: boolean;
  isDual: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

const roomSchema = new mongoose.Schema(
  {
    roomName: { type: String, required: true, unique: true },
    messageIds: { type: [mongoose.Types.ObjectId], default: [], index: 1 },
    participantIds: { type: [mongoose.Types.ObjectId], required: true },
    isPublic: { type: Boolean, required: true },
    isDual: { type: Boolean, required: false },
  },
  { timestamps: true }
);

roomSchema.virtual("messages", {
  ref: "messages",
  localField: "messageIds",
  foreignField: "_id",
  justOne: false,
});

roomSchema.virtual("participants", {
  ref: "users",
  localField: "participantIds",
  foreignField: "_id",
  justOne: false,
});

roomSchema.set("toObject", { virtuals: true });
roomSchema.set("toJSON", { virtuals: true });

export const RoomModel = mongoose.model<IRoom>("rooms", roomSchema);
