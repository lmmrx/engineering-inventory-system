-- When each password was last set, for password expiry. Existing accounts
-- start counting from now rather than being expired on deploy.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
