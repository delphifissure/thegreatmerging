/** Load .env.local (developer overrides, gitignored) and then .env for scripts run outside Next.js. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
