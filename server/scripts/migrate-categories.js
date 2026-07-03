import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting category migration...');

  // 1. 获取所有现有话题
  const topics = await prisma.topic.findMany();
  console.log(`Found ${topics.length} topics.`);

  // 2. 提取唯一的非空分类名
  const categoryNames = [...new Set(topics.map(t => t.category).filter(Boolean))];
  console.log(`Found ${categoryNames.length} unique categories:`, categoryNames);

  // 3. 创建对应的 TopicCategory 记录
  const categoryMap = new Map(); // name -> id
  
  for (let i = 0; i < categoryNames.length; i++) {
    const name = categoryNames[i];
    let cat = await prisma.topicCategory.findUnique({ where: { name } });
    if (!cat) {
      cat = await prisma.topicCategory.create({
        data: {
          name,
          sortOrder: i,
        }
      });
      console.log(`Created TopicCategory: ${name} (${cat.id})`);
    }
    categoryMap.set(name, cat.id);
  }

  // 4. 更新现有的 Topic 关联
  let updatedCount = 0;
  for (const topic of topics) {
    if (topic.category && categoryMap.has(topic.category)) {
      const categoryId = categoryMap.get(topic.category);
      if (topic.categoryId !== categoryId) {
        await prisma.topic.update({
          where: { id: topic.id },
          data: { categoryId }
        });
        updatedCount++;
      }
    }
  }

  console.log(`Successfully updated ${updatedCount} topics with categoryId.`);
  console.log('Migration completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
