import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  nickname: string;
  password: string;
  updatedAt?: Date;
  createdAt?: Date;
}

const userSchema = new mongoose.Schema(
  {
    nickname: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>("users", userSchema);
