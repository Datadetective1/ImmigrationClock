// Prisma client singleton. Only instantiated when USE_DATABASE === "true".
// The MVP renders from the bundled sample dataset, so importing this module is
// safe even without a database — the client is created lazily.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const USE_DATABASE = process.env.USE_DATABASE === "true";
