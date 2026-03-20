import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPlayer extends Document {
  name: string;
  sessionId: string;       // random temp ID (e.g. uuid)
  points: number;
  gamesPlayed: number;
  createdAt: Date;
}

const PlayerSchema: Schema<IPlayer> = new Schema({
  name: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // auto delete after 24hrs
});

const Player: Model<IPlayer> =
  mongoose.models.Player || mongoose.model<IPlayer>("Player", PlayerSchema);

export default Player;