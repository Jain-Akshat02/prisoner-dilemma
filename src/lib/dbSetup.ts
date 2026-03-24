import mongoose from "mongoose";

type ConnectionObject = {
  isConnected?: number;
};

const connection: ConnectionObject = {};

async function connect(): Promise<void> {
  if (connection.isConnected) {
    console.log("Already connected");
    return;
  }

  try {
    console.log("Connecting to MongoDB");
    const db = await mongoose.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 5000, // Fails quickly (5s) instead of hanging for 30s
    });
    connection.isConnected = db.connections[0].readyState;
    console.log("MongoDB connected successfully");
  } catch (error: unknown) {
    console.log("Something went wrong", (error as Error).message);
    process.exit(1);
  }
}

export default connect;