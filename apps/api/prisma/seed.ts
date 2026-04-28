import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create test user
  const user = await prisma.user.upsert({
    where: { clerkId: "test_clerk_id" },
    update: {},
    create: {
      clerkId: "test_clerk_id",
      email: "admin@example.com",
      name: "Admin User",
    },
  });
  console.log(`Created user: ${user.email} (${user.id})`);

  // Create workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme-corp",
      plan: "FREE",
    },
  });
  console.log(`Created workspace: ${workspace.name} (${workspace.id})`);

  // Assign user as OWNER
  const membership = await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "OWNER",
    },
  });
  console.log(`Assigned ${user.email} as OWNER of ${workspace.name}`);

  // Create sample agent
  const agent = await prisma.agent.upsert({
    where: { id: "seed-agent-general-assistant" },
    update: {},
    create: {
      id: "seed-agent-general-assistant",
      name: "General Assistant",
      description: "A general-purpose AI assistant for your workspace.",
      systemPrompt:
        "You are a helpful AI assistant. Answer questions clearly and concisely. If you don't know something, say so.",
      model: "gpt-4o",
      tools: [],
      memoryEnabled: true,
      ragEnabled: false,
      maxTokens: 4096,
      temperature: 0.7,
      workspaceId: workspace.id,
      createdById: user.id,
    },
  });
  console.log(`Created agent: ${agent.name} (${agent.id})`);

  console.log("\nSeed complete!");
  console.log({
    userId: user.id,
    workspaceId: workspace.id,
    membershipId: membership.id,
    agentId: agent.id,
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
