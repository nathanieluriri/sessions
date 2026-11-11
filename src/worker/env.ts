export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA?: R2Bucket;
  APP_URL: string;
  STUDIO_NAME: string;
  STUDIO_EMAIL: string;
  STUDIO_PHONE: string;
  PAYSTACK_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Cloudflare Email Sending. Present in production once the binding is deployed. */
  EMAIL?: {
    send(message: {
      to: string | string[];
      from: string | { email: string; name?: string };
      replyTo?: string | { email: string; name?: string };
      subject: string;
      text?: string;
      html?: string;
    }): Promise<{ messageId: string }>;
  };
}

export type Role = "client" | "admin" | "ceo";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
  level: string;
  title: string;
  permissions: string[];
  emailVerified: boolean;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null } };
