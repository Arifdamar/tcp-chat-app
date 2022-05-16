import dotenv from "dotenv";

dotenv.config();

export class ServerConfig {
  public mongoUrl: string;
  public port: number;

  constructor() {
    if (!process.env.CONNECTION_URL) {
      throw new Error("CONNECTION_URL must be specified!");
    }
    this.mongoUrl = process.env.CONNECTION_URL;

    if (!process.env.PORT) {
      throw new Error("PORT must be specified!");
    }
    this.port = +process.env.PORT;
  }
}

export const serverConfig = new ServerConfig();
