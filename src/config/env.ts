import { z } from 'zod';

const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, "Missing Firebase API Key").optional(),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  VITE_FIREBASE_PROJECT_ID: z.string().optional(),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  VITE_FIREBASE_APP_ID: z.string().optional(),
  VITE_APP_CHECK_KEY: z.string().optional(),
});

// Parse the environment variables at startup
const parsedEnv = envSchema.safeParse(import.meta.env);

if (!parsedEnv.success) {
  console.error("❌ Environment variable validation failed:", parsedEnv.error.format());
}

export const env = parsedEnv.success ? parsedEnv.data : {} as z.infer<typeof envSchema>;

// Helper to check if we are running in a totally unconfigured demo mode
export const isMissingConfig = !env.VITE_FIREBASE_API_KEY;
