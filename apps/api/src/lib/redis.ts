import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error("Redis error", { error: err.message });
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});
