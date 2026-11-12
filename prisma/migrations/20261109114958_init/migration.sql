-- CreateEnum
CREATE TYPE "InfluencerStatus" AS ENUM ('NEW', 'SHORTLISTED', 'SELECTED', 'REJECTED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "Eligibility" AS ENUM ('UNKNOWN', 'OK', 'NOT_PROFESSIONAL', 'NOT_FOUND', 'ERROR');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('REEL', 'IMAGE', 'CAROUSEL', 'VIDEO', 'STORY', 'OTHER');

-- CreateEnum
CREATE TYPE "MetricsSource" AS ENUM ('DISCOVERY', 'INSIGHTS');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'VISITED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT,
    "niche" TEXT,
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followersDeclared" INTEGER,
    "budget" INTEGER,
    "outreachStatus" TEXT,
    "status" "InfluencerStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "igUserId" TEXT,
    "eligibility" "Eligibility" NOT NULL DEFAULT 'UNKNOWN',
    "eligibilityNote" TEXT,
    "followersCount" INTEGER,
    "mediaCount" INTEGER,
    "profilePictureUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowsRead" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "merged" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "permalink" TEXT,
    "caption" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "likeCount" INTEGER,
    "commentsCount" INTEGER,
    "reach" INTEGER,
    "views" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "totalInteractions" INTEGER,
    "source" "MetricsSource" NOT NULL DEFAULT 'DISCOVERY',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshot" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followersCount" INTEGER,
    "mediaCount" INTEGER,

    CONSTRAINT "ProfileSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "concept" TEXT,
    "visitOrHome" TEXT,
    "visitDate" TIMESTAMP(3),
    "postingDate" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgConnection" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "igUserId" TEXT,
    "tokenCipher" TEXT,
    "tokenExpires" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_handle_key" ON "Influencer"("handle");

-- CreateIndex
CREATE INDEX "Influencer_status_idx" ON "Influencer"("status");

-- CreateIndex
CREATE INDEX "Influencer_eligibility_idx" ON "Influencer"("eligibility");

-- CreateIndex
CREATE INDEX "Media_influencerId_timestamp_idx" ON "Media"("influencerId", "timestamp");

-- CreateIndex
CREATE INDEX "ProfileSnapshot_influencerId_syncedAt_idx" ON "ProfileSnapshot"("influencerId", "syncedAt");

-- CreateIndex
CREATE INDEX "Assignment_influencerId_idx" ON "Assignment"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "IgConnection_influencerId_key" ON "IgConnection"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "IgConnection_inviteToken_key" ON "IgConnection"("inviteToken");

-- CreateIndex
CREATE INDEX "SyncRun_status_createdAt_idx" ON "SyncRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSnapshot" ADD CONSTRAINT "ProfileSnapshot_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgConnection" ADD CONSTRAINT "IgConnection_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
