import dotenv from "dotenv";

dotenv.config();

export class ServerConfig {
  public mongoUrl: string;

  constructor() {
    if (!process.env.CONNECTION_URL) {
      throw new Error("CONNECTION_URL must be specified!");
    }
    this.mongoUrl = process.env.CONNECTION_URL;
  }
}

export const serverConfig = new ServerConfig();
