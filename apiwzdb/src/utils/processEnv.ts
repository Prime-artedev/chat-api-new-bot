export interface Env {
  PUSHER_APP_ID: string;
  PUSHER_KEY: string;
  PUSHER_SECRET: string;
  PUSHER_CLUSTER: string;

  WEBOOK_BASE_URL: string;
  DISABLE_WEBHOOK: boolean;
  WEBOOK_SSL_VERIFY: boolean;

  BROWSER_CLIENT: string;
  BROWSER_NAME: string;
}

export const getEnv = (): Env => {
  const env = process.env;
  const envKeys = Object.keys(env);

  const requiredEnvKeys = [
    "PUSHER_APP_ID",
    "PUSHER_KEY",
    "PUSHER_SECRET",
    "PUSHER_CLUSTER",
    "WEBOOK_BASE_URL",
    "WEBOOK_SSL_VERIFY",
    "BROWSER_CLIENT",
    "BROWSER_NAME",
    "DISABLE_WEBHOOK",
  ];

  const missingEnvKeys = requiredEnvKeys.filter(
    (key) => !envKeys.includes(key)
  );

  if (missingEnvKeys.length > 0) {
    console.log(env);

    throw new Error(
      `Missing environment variables: ${missingEnvKeys.join(", ")}`
    );
  }

  return {
    PUSHER_APP_ID: env.PUSHER_APP_ID as string,
    PUSHER_KEY: env.PUSHER_KEY as string,
    PUSHER_SECRET: env.PUSHER_SECRET as string,
    PUSHER_CLUSTER: env.PUSHER_CLUSTER as string,
    WEBOOK_BASE_URL: env.WEBOOK_BASE_URL as string,
    WEBOOK_SSL_VERIFY: env.WEBOOK_SSL_VERIFY === "true",
    DISABLE_WEBHOOK: env.DISABLE_WEBHOOK === "true",
    BROWSER_CLIENT: env.BROWSER_CLIENT as string,
    BROWSER_NAME: env.BROWSER_NAME as string,
  };
};
