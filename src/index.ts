import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const requestedPort = Number(process.env.PORT ?? 8000);
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: requestedPort
  },
  (info) => {
    console.log(`lms-service listening on http://localhost:${info.port}`);
  }
);
