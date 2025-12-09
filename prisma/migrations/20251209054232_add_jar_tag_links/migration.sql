-- CreateTable
CREATE TABLE "JarLink" (
    "id" TEXT NOT NULL,
    "sourceJarId" TEXT NOT NULL,
    "targetJarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagLink" (
    "id" TEXT NOT NULL,
    "sourceTagId" TEXT NOT NULL,
    "targetTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarTagLink" (
    "id" TEXT NOT NULL,
    "jarId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JarLink_sourceJarId_targetJarId_key" ON "JarLink"("sourceJarId", "targetJarId");

-- CreateIndex
CREATE UNIQUE INDEX "TagLink_sourceTagId_targetTagId_key" ON "TagLink"("sourceTagId", "targetTagId");

-- CreateIndex
CREATE UNIQUE INDEX "JarTagLink_jarId_tagId_key" ON "JarTagLink"("jarId", "tagId");

-- AddForeignKey
ALTER TABLE "JarLink" ADD CONSTRAINT "JarLink_sourceJarId_fkey" FOREIGN KEY ("sourceJarId") REFERENCES "Jar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarLink" ADD CONSTRAINT "JarLink_targetJarId_fkey" FOREIGN KEY ("targetJarId") REFERENCES "Jar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagLink" ADD CONSTRAINT "TagLink_sourceTagId_fkey" FOREIGN KEY ("sourceTagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagLink" ADD CONSTRAINT "TagLink_targetTagId_fkey" FOREIGN KEY ("targetTagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarTagLink" ADD CONSTRAINT "JarTagLink_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarTagLink" ADD CONSTRAINT "JarTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
