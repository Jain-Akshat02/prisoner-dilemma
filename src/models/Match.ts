import mongoose, { Schema, Document, Model } from "mongoose";

export type Choice = "cooperate" | "betray";
export type MatchStatus = "waiting" | "ongoing" | "completed";

export interface IRound {
  roundNumber: number;
  player1Choice: Choice;
  player2Choice: Choice;
  player1Points: number;
  player2Points: number;
}

export interface IMatch extends Document {
  roomId: mongoose.Types.ObjectId;       // which room this match belongs to
  player1: mongoose.Types.ObjectId;
  player2: mongoose.Types.ObjectId;
  player1Choice?: Choice;                // current round's pending choice
  player2Choice?: Choice;
  player1TotalPoints: number;            // cumulative across all rounds
  player2TotalPoints: number;
  roundDeadline?: Date;
  resolvedRoundNumber: number;
  status: MatchStatus;
  rounds: IRound[];
  currentRound: number;
  totalRounds: number;
  createdAt: Date;
  player1Ready?: boolean;
  player2Ready?: boolean;
}

const RoundSchema = new Schema<IRound>({
  roundNumber: { type: Number, required: true },
  player1Choice: { type: String, enum: ["cooperate", "betray"] },
  player2Choice: { type: String, enum: ["cooperate", "betray"] },
  player1Points: { type: Number, default: 0 },
  player2Points: { type: Number, default: 0 },
});

const MatchSchema: Schema<IMatch> = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
  player1: { type: Schema.Types.ObjectId, ref: "Player", required: true },
  player2: { type: Schema.Types.ObjectId, ref: "Player", required: true },
  player1Choice: { type: String, enum: ["cooperate", "betray"] },
  player2Choice: { type: String, enum: ["cooperate", "betray"] },
  player1TotalPoints: { type: Number, default: 0 },
  player2TotalPoints: { type: Number, default: 0 },
  roundDeadline: { type: Date },
  status: { type: String, enum: ["waiting", "ongoing", "completed"], default: "waiting" },
  rounds: [RoundSchema],
  currentRound: { type: Number, default: 1 },
  resolvedRoundNumber: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
  player1Ready: {type: Boolean, default: false},
  player2Ready: {type: Boolean, default: false}

});

const Match: Model<IMatch> =
  mongoose.models.Match || mongoose.model<IMatch>("Match", MatchSchema);

export default Match;