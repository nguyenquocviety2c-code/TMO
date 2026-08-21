-- CreateTable
CREATE TABLE "JobQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "documentId" TEXT,
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DailyTokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyTokenByProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyTokenByProviderSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyTokenByProviderModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyTokenByAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT 'mixed',
    "pageCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "errorMessage" TEXT,
    "userPaused" BOOLEAN NOT NULL DEFAULT false,
    "processingSteps" TEXT NOT NULL DEFAULT '[]',
    "processingPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "chunkId" TEXT,
    "entityName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "description" TEXT,
    "properties" TEXT,
    "confidenceScore" REAL NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "domain" TEXT,
    "resolvedEntityId" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "sourceEntityId" TEXT,
    "targetEntityId" TEXT,
    "sourceEntityName" TEXT,
    "targetEntityName" TEXT,
    "relationshipType" TEXT NOT NULL,
    "description" TEXT,
    "confidenceScore" REAL NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'mixed',
    "capable" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "team" TEXT,
    "position" TEXT,
    "avatar" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "sessionId" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "title" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "agentProfileId" TEXT,
    "teamMode" TEXT,
    "teamName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "eventType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "wrongAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "reason" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "preferenceKey" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bundled',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "description" TEXT,
    "authorHandle" TEXT,
    "archiveUrl" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "files" TEXT,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "tools" TEXT,
    "hasPlugin" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ToolPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "toolName" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'allow',
    "source" TEXT NOT NULL DEFAULT 'builtin',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "maxCallsPerHour" INTEGER,
    "lastUsedAt" DATETIME,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeAccessPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "allowRead" BOOLEAN NOT NULL DEFAULT true,
    "allowWrite" BOOLEAN NOT NULL DEFAULT true,
    "allowDelete" BOOLEAN NOT NULL DEFAULT false,
    "allowedCollections" TEXT NOT NULL DEFAULT 'theopus_documents,theopus_chunks',
    "allowedLabels" TEXT NOT NULL DEFAULT '*'
);

-- CreateTable
CREATE TABLE "CronJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "expression" TEXT NOT NULL,
    "taskPrompt" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StandingOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "order" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TaskExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ChannelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelType" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LocalResolvedEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "canonicalName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "description" TEXT,
    "properties" TEXT,
    "avgConfidence" REAL NOT NULL DEFAULT 0.5,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "domains" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpenCodeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "filesTouched" TEXT NOT NULL DEFAULT '[]',
    "toolsUsed" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MCPBridgeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutoLearnRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "answerPreview" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "entitiesCount" INTEGER NOT NULL DEFAULT 0,
    "relationshipsCount" INTEGER NOT NULL DEFAULT 0,
    "chunkSaved" BOOLEAN NOT NULL DEFAULT false,
    "neo4jSynced" BOOLEAN NOT NULL DEFAULT false,
    "qdrantPointId" TEXT,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmbeddingCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'passage',
    "model" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CodeTeamWorklog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" TEXT NOT NULL DEFAULT '[]',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CodeTeamSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "routingMode" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'pending',
    "currentAgent" TEXT,
    "completedAgents" TEXT NOT NULL DEFAULT '[]',
    "partsDefinition" TEXT NOT NULL DEFAULT '[]',
    "opencodeSessionId" TEXT,
    "totalDuration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CodeTeamCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "filesModified" TEXT NOT NULL DEFAULT '[]',
    "keyDecisions" TEXT NOT NULL DEFAULT '[]',
    "pendingIssues" TEXT NOT NULL DEFAULT '[]',
    "progressSnapshot" TEXT NOT NULL,
    "contextSnapshot" TEXT NOT NULL,
    "routingDecision" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SmolabTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT NOT NULL,
    "agentProfileId" TEXT,
    "teamName" TEXT,
    "inputSummary" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmolabTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("sessionId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "sessionId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" DATETIME,
    "qdrantPointId" TEXT,
    "embeddingModel" TEXT,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemoryAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoryId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "query" TEXT,
    "relevance" REAL NOT NULL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CustomTool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "handlerCode" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "source" TEXT NOT NULL DEFAULT 'custom',
    "category" TEXT NOT NULL DEFAULT 'Custom',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL DEFAULT 'default',
    "skillSlug" TEXT,
    "testArgs" TEXT,
    "lastTestedAt" DATETIME,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "agentName" TEXT,
    "toolName" TEXT NOT NULL,
    "toolSource" TEXT NOT NULL DEFAULT 'unknown',
    "args" TEXT,
    "result" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sessionId" TEXT,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ToolApprovalQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL DEFAULT 'default',
    "agentName" TEXT,
    "toolName" TEXT NOT NULL,
    "args" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateIndex
CREATE INDEX "JobQueue_status_priority_idx" ON "JobQueue"("status", "priority");

-- CreateIndex
CREATE INDEX "JobQueue_type_status_idx" ON "JobQueue"("type", "status");

-- CreateIndex
CREATE INDEX "JobQueue_documentId_idx" ON "JobQueue"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenUsage_date_key" ON "DailyTokenUsage"("date");

-- CreateIndex
CREATE INDEX "DailyTokenUsage_date_idx" ON "DailyTokenUsage"("date");

-- CreateIndex
CREATE INDEX "DailyTokenByProvider_date_idx" ON "DailyTokenByProvider"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenByProvider_date_provider_key" ON "DailyTokenByProvider"("date", "provider");

-- CreateIndex
CREATE INDEX "DailyTokenByProviderSlot_date_idx" ON "DailyTokenByProviderSlot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenByProviderSlot_date_provider_slot_key" ON "DailyTokenByProviderSlot"("date", "provider", "slot");

-- CreateIndex
CREATE INDEX "DailyTokenByProviderModel_date_idx" ON "DailyTokenByProviderModel"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenByProviderModel_date_provider_model_key" ON "DailyTokenByProviderModel"("date", "provider", "model");

-- CreateIndex
CREATE INDEX "DailyTokenByAgent_date_idx" ON "DailyTokenByAgent"("date");

-- CreateIndex
CREATE INDEX "DailyTokenByAgent_agentId_idx" ON "DailyTokenByAgent"("agentId");

-- CreateIndex
CREATE INDEX "DailyTokenByAgent_date_agentId_idx" ON "DailyTokenByAgent"("date", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenByAgent_date_agentId_provider_model_key" ON "DailyTokenByAgent"("date", "agentId", "provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Document_title_key" ON "Document"("title");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_domain_idx" ON "Document"("domain");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE INDEX "Document_userPaused_idx" ON "Document"("userPaused");

-- CreateIndex
CREATE INDEX "LocalEntity_documentId_idx" ON "LocalEntity"("documentId");

-- CreateIndex
CREATE INDEX "LocalEntity_entityName_idx" ON "LocalEntity"("entityName");

-- CreateIndex
CREATE INDEX "LocalEntity_entityType_idx" ON "LocalEntity"("entityType");

-- CreateIndex
CREATE INDEX "LocalEntity_domain_idx" ON "LocalEntity"("domain");

-- CreateIndex
CREATE INDEX "LocalEntity_synced_idx" ON "LocalEntity"("synced");

-- CreateIndex
CREATE INDEX "LocalRelationship_documentId_idx" ON "LocalRelationship"("documentId");

-- CreateIndex
CREATE INDEX "LocalRelationship_relationshipType_idx" ON "LocalRelationship"("relationshipType");

-- CreateIndex
CREATE INDEX "LocalRelationship_sourceEntityId_idx" ON "LocalRelationship"("sourceEntityId");

-- CreateIndex
CREATE INDEX "LocalRelationship_targetEntityId_idx" ON "LocalRelationship"("targetEntityId");

-- CreateIndex
CREATE INDEX "LocalRelationship_synced_idx" ON "LocalRelationship"("synced");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_name_key" ON "AgentProfile"("name");

-- CreateIndex
CREATE INDEX "AgentProfile_team_idx" ON "AgentProfile"("team");

-- CreateIndex
CREATE INDEX "AgentProfile_provider_idx" ON "AgentProfile"("provider");

-- CreateIndex
CREATE INDEX "AgentProfile_enabled_idx" ON "AgentProfile"("enabled");

-- CreateIndex
CREATE INDEX "AgentProfile_isSystem_idx" ON "AgentProfile"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_sessionId_key" ON "AgentSession"("sessionId");

-- CreateIndex
CREATE INDEX "AgentSession_agentId_idx" ON "AgentSession"("agentId");

-- CreateIndex
CREATE INDEX "AgentSession_agentProfileId_idx" ON "AgentSession"("agentProfileId");

-- CreateIndex
CREATE INDEX "AgentSession_teamName_idx" ON "AgentSession"("teamName");

-- CreateIndex
CREATE INDEX "AgentSession_createdAt_idx" ON "AgentSession"("createdAt");

-- CreateIndex
CREATE INDEX "LearningLog_agentId_idx" ON "LearningLog"("agentId");

-- CreateIndex
CREATE INDEX "LearningLog_eventType_idx" ON "LearningLog"("eventType");

-- CreateIndex
CREATE INDEX "LearningLog_createdAt_idx" ON "LearningLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentInsight_agentId_idx" ON "AgentInsight"("agentId");

-- CreateIndex
CREATE INDEX "AgentInsight_type_idx" ON "AgentInsight"("type");

-- CreateIndex
CREATE INDEX "AgentInsight_createdAt_idx" ON "AgentInsight"("createdAt");

-- CreateIndex
CREATE INDEX "AgentCorrection_agentId_idx" ON "AgentCorrection"("agentId");

-- CreateIndex
CREATE INDEX "AgentCorrection_applied_idx" ON "AgentCorrection"("applied");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPreference_agentId_preferenceKey_key" ON "AgentPreference"("agentId", "preferenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_agentId_slug_key" ON "AgentSkill"("agentId", "slug");

-- CreateIndex
CREATE INDEX "ToolPermission_toolName_idx" ON "ToolPermission"("toolName");

-- CreateIndex
CREATE UNIQUE INDEX "ToolPermission_agentId_toolName_key" ON "ToolPermission"("agentId", "toolName");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeAccessPolicy_agentId_key" ON "KnowledgeAccessPolicy"("agentId");

-- CreateIndex
CREATE INDEX "CronJob_agentId_idx" ON "CronJob"("agentId");

-- CreateIndex
CREATE INDEX "CronJob_enabled_idx" ON "CronJob"("enabled");

-- CreateIndex
CREATE INDEX "Webhook_agentId_idx" ON "Webhook"("agentId");

-- CreateIndex
CREATE INDEX "StandingOrder_agentId_idx" ON "StandingOrder"("agentId");

-- CreateIndex
CREATE INDEX "TaskExecution_type_idx" ON "TaskExecution"("type");

-- CreateIndex
CREATE INDEX "TaskExecution_status_idx" ON "TaskExecution"("status");

-- CreateIndex
CREATE INDEX "TaskExecution_startedAt_idx" ON "TaskExecution"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfig_channelType_key" ON "ChannelConfig"("channelType");

-- CreateIndex
CREATE UNIQUE INDEX "LocalResolvedEntity_canonicalName_key" ON "LocalResolvedEntity"("canonicalName");

-- CreateIndex
CREATE INDEX "LocalResolvedEntity_documentId_idx" ON "LocalResolvedEntity"("documentId");

-- CreateIndex
CREATE INDEX "LocalResolvedEntity_synced_idx" ON "LocalResolvedEntity"("synced");

-- CreateIndex
CREATE UNIQUE INDEX "OpenCodeSession_sessionId_key" ON "OpenCodeSession"("sessionId");

-- CreateIndex
CREATE INDEX "OpenCodeSession_status_idx" ON "OpenCodeSession"("status");

-- CreateIndex
CREATE INDEX "OpenCodeSession_createdAt_idx" ON "OpenCodeSession"("createdAt");

-- CreateIndex
CREATE INDEX "MCPBridgeConfig_direction_idx" ON "MCPBridgeConfig"("direction");

-- CreateIndex
CREATE UNIQUE INDEX "MCPBridgeConfig_direction_toolName_key" ON "MCPBridgeConfig"("direction", "toolName");

-- CreateIndex
CREATE INDEX "AutoLearnRecord_agentId_idx" ON "AutoLearnRecord"("agentId");

-- CreateIndex
CREATE INDEX "AutoLearnRecord_createdAt_idx" ON "AutoLearnRecord"("createdAt");

-- CreateIndex
CREATE INDEX "AutoLearnRecord_confidence_idx" ON "AutoLearnRecord"("confidence");

-- CreateIndex
CREATE INDEX "AutoLearnRecord_status_idx" ON "AutoLearnRecord"("status");

-- CreateIndex
CREATE INDEX "EmbeddingCache_expiresAt_idx" ON "EmbeddingCache"("expiresAt");

-- CreateIndex
CREATE INDEX "EmbeddingCache_lastHitAt_idx" ON "EmbeddingCache"("lastHitAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmbeddingCache_hash_inputType_key" ON "EmbeddingCache"("hash", "inputType");

-- CreateIndex
CREATE INDEX "CodeTeamWorklog_sessionId_idx" ON "CodeTeamWorklog"("sessionId");

-- CreateIndex
CREATE INDEX "CodeTeamWorklog_agentName_idx" ON "CodeTeamWorklog"("agentName");

-- CreateIndex
CREATE INDEX "CodeTeamWorklog_sessionId_position_idx" ON "CodeTeamWorklog"("sessionId", "position");

-- CreateIndex
CREATE INDEX "CodeTeamWorklog_createdAt_idx" ON "CodeTeamWorklog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeTeamSession_sessionId_key" ON "CodeTeamSession"("sessionId");

-- CreateIndex
CREATE INDEX "CodeTeamSession_sessionId_idx" ON "CodeTeamSession"("sessionId");

-- CreateIndex
CREATE INDEX "CodeTeamSession_currentStep_idx" ON "CodeTeamSession"("currentStep");

-- CreateIndex
CREATE INDEX "CodeTeamSession_createdAt_idx" ON "CodeTeamSession"("createdAt");

-- CreateIndex
CREATE INDEX "CodeTeamCheckpoint_sessionId_idx" ON "CodeTeamCheckpoint"("sessionId");

-- CreateIndex
CREATE INDEX "CodeTeamCheckpoint_phase_idx" ON "CodeTeamCheckpoint"("phase");

-- CreateIndex
CREATE INDEX "CodeTeamCheckpoint_createdAt_idx" ON "CodeTeamCheckpoint"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_role_idx" ON "ChatMessage"("role");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmolabTask_sessionId_idx" ON "SmolabTask"("sessionId");

-- CreateIndex
CREATE INDEX "SmolabTask_agentProfileId_status_idx" ON "SmolabTask"("agentProfileId", "status");

-- CreateIndex
CREATE INDEX "SmolabTask_teamName_status_idx" ON "SmolabTask"("teamName", "status");

-- CreateIndex
CREATE INDEX "SmolabTask_status_idx" ON "SmolabTask"("status");

-- CreateIndex
CREATE INDEX "SmolabTask_createdAt_idx" ON "SmolabTask"("createdAt");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_idx" ON "AgentMemory"("agentId");

-- CreateIndex
CREATE INDEX "AgentMemory_category_idx" ON "AgentMemory"("category");

-- CreateIndex
CREATE INDEX "AgentMemory_importance_idx" ON "AgentMemory"("importance");

-- CreateIndex
CREATE INDEX "AgentMemory_accessCount_idx" ON "AgentMemory"("accessCount");

-- CreateIndex
CREATE INDEX "AgentMemory_isActive_idx" ON "AgentMemory"("isActive");

-- CreateIndex
CREATE INDEX "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt");

-- CreateIndex
CREATE INDEX "AgentMemory_lastAccessedAt_idx" ON "AgentMemory"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_key_idx" ON "UserProfile"("key");

-- CreateIndex
CREATE INDEX "UserProfile_isActive_idx" ON "UserProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key_key" ON "UserProfile"("userId", "key");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_memoryId_idx" ON "MemoryAccessLog"("memoryId");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_agentId_idx" ON "MemoryAccessLog"("agentId");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_createdAt_idx" ON "MemoryAccessLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTool_name_key" ON "CustomTool"("name");

-- CreateIndex
CREATE INDEX "CustomTool_enabled_idx" ON "CustomTool"("enabled");

-- CreateIndex
CREATE INDEX "CustomTool_category_idx" ON "CustomTool"("category");

-- CreateIndex
CREATE INDEX "CustomTool_source_idx" ON "CustomTool"("source");

-- CreateIndex
CREATE INDEX "CustomTool_authorId_idx" ON "CustomTool"("authorId");

-- CreateIndex
CREATE INDEX "ToolCallLog_toolName_idx" ON "ToolCallLog"("toolName");

-- CreateIndex
CREATE INDEX "ToolCallLog_agentId_idx" ON "ToolCallLog"("agentId");

-- CreateIndex
CREATE INDEX "ToolCallLog_success_idx" ON "ToolCallLog"("success");

-- CreateIndex
CREATE INDEX "ToolCallLog_createdAt_idx" ON "ToolCallLog"("createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_toolSource_idx" ON "ToolCallLog"("toolSource");

-- CreateIndex
CREATE INDEX "ToolApprovalQueue_status_idx" ON "ToolApprovalQueue"("status");

-- CreateIndex
CREATE INDEX "ToolApprovalQueue_agentId_idx" ON "ToolApprovalQueue"("agentId");

-- CreateIndex
CREATE INDEX "ToolApprovalQueue_createdAt_idx" ON "ToolApprovalQueue"("createdAt");
