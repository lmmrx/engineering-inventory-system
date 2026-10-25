-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

