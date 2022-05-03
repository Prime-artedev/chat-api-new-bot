import { Configuration, Inject } from "@tsed/di";
import { $log, PlatformApplication } from "@tsed/common";
import "@tsed/platform-express"; // /!\ keep this import
import compress from "compression";
import cookieParser from "cookie-parser";
import methodOverride from "method-override";
import cors from "cors";
import "@tsed/ajv";
import "@tsed/swagger";
import { config, rootDir } from "./config";

//----------- Added by Raj ------------
import * as Fs from "fs";
import * as dotenv from "dotenv";
import { Env } from "@tsed/core";
import { json, urlencoded } from "express";
import { join } from "path";
dotenv.config();
//-------------------------------------

export const isProduction = process.env.NODE_ENV === Env.PROD;

$log.appenders.set("everything", {
  type: "file",
  filename: "logs/logs.log",
  maxLogSize: 10485760,
  backups: 1,
  levels: ["error"],
  pattern: ".yyyy-MM-dd.log",
});

if (isProduction) {
  $log.appenders.set("stdout", {
    type: "stdout",
    levels: ["info", "debug"],
    layout: {
      type: "json",
    },
  });

  $log.appenders.set("stderr", {
    levels: ["trace", "fatal", "error", "warn"],
    type: "stderr",
    layout: {
      type: "json",
    },
  });
}

@Configuration({
  ...config,
  multer: {
    dest: join(process.cwd(), '.tmp')
  },
  acceptMimes: ["application/json"],
  // httpPort: process.env.PORT || 8083,
  // httpsPort: false, // CHANGE
  httpPort: process.env.PORT || process.env.HTTP_PORT || 8083,
  httpsPort: process.env.PORT || process.env.HTTPS_PORT || false, // CHANGE
  httpsOptions: process.env.PORT
    ? {}
    : {
      key: Fs.readFileSync(`${rootDir}/../ssl/key.pem`),
      cert: Fs.readFileSync(`${rootDir}/../ssl/cert.pem`),
      passphrase: "tsed",
    },
  mount: {
    "/rest": [`${rootDir}/controllers/**/*.ts`],
  },
  swagger: [
    {
      path: "/v3/docs",
      specVersion: "3.0.1",
    },
  ],
  statics: {
    "/": {
      root: `${rootDir}/public`,
      // Optional
      hook: "$beforeRoutesInit", // Load statics on the expected hook. Default: $afterRoutesInit
      // ... statics options
    },
  },
  views: {
    root: `${rootDir}/views`,
    extensions: {
      ejs: "ejs",
    },
  },
  exclude: ["**/*.spec.ts"],
})
export class Server {
  @Inject()
  app: PlatformApplication;

  @Configuration()
  settings: Configuration;

  $beforeRoutesInit(): void {
    this.app
      .use(cors())
      .use(cookieParser())
      .use(compress({}))
      .use(methodOverride())
      .use(json())
      .use(urlencoded({ extended: true, })
      );
  }
}
