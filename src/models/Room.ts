import mongoose, { Schema, Document, Model } from "mongoose";

export type RoomStatus = "waiting" | "ongoing" | "completed";

export interface IRoom extends Document {
  roomCode: string;
  players: mongoose.Types.ObjectId[];
  matches: mongoose.Types.ObjectId[];    // all 1v1 matches in this room
  maxPlayers: number;
  status: RoomStatus;
  createdAt: Date;
}

const RoomSchema: Schema<IRoom> = new Schema({
  roomCode: { type: String, required: true, unique: true },
  players: [{ type: Schema.Types.ObjectId, ref: "Player" }],
  matches: [{ type: Schema.Types.ObjectId, ref: "Match" }],
  maxPlayers: { type: Number, default: 8 },
  status: { type: String, enum: ["waiting", "ongoing", "completed"], default: "waiting" },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);

export default Room;